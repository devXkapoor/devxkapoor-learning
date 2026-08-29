# slotline — the Postgres mastery project

## What you're building

`slotline` is a multi-tenant booking backend. A tenant is a small business that
rents time on a finite resource: a recording studio with three rooms, a physio clinic
with four practitioners, a coworking space with eight desks, a padel club with two
courts. Each tenant defines their resources and their opening hours; customers book a
resource for a window of time; the tenant sees a calendar, a revenue figure, and a
searchable history of every booking and note.

It is an entirely ordinary product. Somebody has built this a thousand times, which is
exactly the point — a reviewer understands what it is in one sentence, and nobody has to
be persuaded that the problems it runs into are real problems. What makes it non-trivial
is that it has one invariant that is genuinely hard to hold: **two bookings for the same
resource must never overlap in time.** That single rule is unenforceable in application
code under concurrency, and every serious mechanism in the Postgres landscape ends up
being deployed in service of it, or in service of the traffic that stresses it.

The application logic is deliberately thin. There is no payment integration to actually
work (a fake provider posts webhooks at you), no email to actually send (a worker writes
a row and logs), no frontend beyond a single unstyled HTML page that renders a calendar
so you can see the thing exists. There is no ORM. Queries are hand-written SQL through
the `pg` driver, because the subject of this project is the SQL and the server executing
it, and an ORM's job is to hide exactly the thing you are trying to look at.

Two components exist purely to make the database's behaviour observable, and they are as
important as the API. The first is a **seeder** that can generate a database of arbitrary
size — ten thousand bookings or forty million — with realistic skew, so that "this query
is slow" is something you can reproduce rather than imagine. The second is a **load
generator** that drives concurrent traffic at the running API. Between them they turn the
back half of the landscape — the planner, vacuum, locks, pooling, migrations, replication
— from things you have read about into things that happen to you on a laptop.

The deliverable that makes this repo worth showing is not the API. It is
`docs/incidents/`: a directory of written post-mortems, one per planted failure, each
containing the symptom, the actual `pg_stat_activity` or `EXPLAIN ANALYZE` output you
captured, the diagnosis, and the fix. That directory is the artefact an interviewer will
read, and it is the thing you will be able to talk from for twenty minutes without notes.

## Why this project for this topic

The obvious Postgres project is a CRUD app with some indexes, and it fails because it
never generates pressure. Without concurrent writers there is no lost update, no lock
queue and no deadlock, so Nodes 8, 10 and 11 stay theoretical. Without volume there is
no sequential-scan pain, so Nodes 4, 5 and 6 reduce to "I added an index and it was
faster, probably". Without churn there are no dead tuples, so Node 9 never happens at
all. And without a running system under traffic, a migration is a file you apply to an
empty database, which is the one situation in which Node 13's entire body of knowledge is
irrelevant.

A booking system fixes this at the root because its central invariant is a *concurrency*
invariant. "No two bookings for the same resource overlap" cannot be checked by reading
and then writing — between the read and the write, another request commits. That forces,
in order and with genuine need: range types and an exclusion constraint (Node 14),
explicit row locking with `SELECT ... FOR UPDATE` (Node 11), an understanding of what
READ COMMITTED does and does not prevent (Node 10), and MVCC as the explanation for why
the two transactions saw different worlds (Node 8). None of that is assigned; you reach
for each piece because the previous attempt provably failed under the concurrency test
you wrote.

The nodes that are easy to skip in any solo project are Nodes 12, 13, 17 and 18 —
pooling, live migrations, observability and replication — because they are properties of
systems under load and over time, and a solo project has neither. Each gets a named
mechanism here rather than a hope. Pooling becomes real in Stage 9 by running the load
generator at a connection count that provably exhausts the pool and then putting PgBouncer
in transaction mode in front of it, where server-side prepared statements break in the
exact way they break in production. Migrations become real in the same stage by running
dangerous DDL *while the load generator is running*, which is the only way `lock_timeout`
stops being a line you copied off a blog. Observability and replication become real in
Stage 10, the disaster lab, where a Docker Compose file gives you a primary and a standby
and you plant failures on purpose — an `idle in transaction` session that stalls vacuum,
a bloated table, a lock queue, a bad `DELETE` you then recover from with point-in-time
recovery. Deliberately planting a disaster is the solo-project substitute for waiting to
be unlucky.

One node is honestly not fully forced: Node 16, extensions, is exercised through
`pg_stat_statements`, `pg_trgm`, `pgvector` and `pg_repack`, but PostGIS, TimescaleDB and
Citus stay at [AWARE] because nothing in this domain needs them. That is stated in the
coverage table rather than papered over.

Finally, this closes a specific gap. `qbank` is Fastify + TypeScript + Drizzle + Postgres
+ BullMQ + Redis, and you cannot currently explain its data layer under pressure.
`slotline` is deliberately the same shape with two substitutions — raw SQL instead of
Drizzle, a Postgres queue table instead of BullMQ — so that when you go back to `qbank`
you can see precisely what Drizzle was generating and precisely what BullMQ was buying
you. Stage 6 makes the second comparison explicit.

## The stack

**Postgres 18**, in Docker, pinned by version. Not a managed instance, because you need
`shared_preload_libraries`, a data directory you can look inside, the ability to kill the
server, and the ability to run a second one as a standby.

**Docker Compose**, holding the database, and from Stage 9 onward PgBouncer, and from
Stage 10 a second Postgres as a streaming standby.

**Node.js with TypeScript and Fastify**, because that is `qbank`'s stack and the point is
transferable fluency. Fastify's own capabilities are not the subject; routes stay boring.

**The `pg` driver directly.** No ORM, no query builder. Every query is a string with
`$1` parameters that you wrote and can read in the log. This is a deliberate constraint
for this project only — the professional position (use an ORM for the trivial 95%) is
covered in `drizzle-orm` and `prisma-orm` as separate topics.

**Plain SQL migration files**, numbered, applied by a fifty-line runner you write in
Stage 1. Not `node-pg-migrate`, not Drizzle Kit — because the whole of Stage 9 is about
what a migration does to a live server, and a tool that wraps everything in a transaction
by default would hide the two most important facts (that `CREATE INDEX CONCURRENTLY`
cannot run inside one, and that DDL queues behind open transactions).

**A seeder and a load generator**, both plain Node scripts in `tools/`. The load
generator needs to produce genuine concurrency — a configurable number of parallel
workers hitting the API — and to report latency percentiles and error counts. It does not
need to be sophisticated; it needs to be honest.

**`pgvector`** from Stage 7, **`pg_trgm`** and **`pg_stat_statements`** from Stage 5,
**`pg_repack`** in Stage 10.

Deliberately absent: Redis, any queue library, any search service, any ORM, any
authentication beyond a tenant id in a header. Every one of those would remove a reason
to use Postgres properly.

---

## Stage 1 — the schema, as a set of enforced invariants

**Forces into use:** Nodes 0, 1, 2, and the first half of Node 14.

**What works at the end:** a Postgres container, a migration runner, and a schema you can
sit in `psql` and try to corrupt — where every attempt is rejected by the server.

Model the domain: `tenants`, `resources` (a room, a chair, a court — belongs to a
tenant), `customers`, `bookings`, and `prices`. Then, before writing a single line of
application code, spend the stage deciding what the database will refuse.

Every column gets a deliberate type, and you should be able to defend each one. `text`
rather than `varchar(n)` unless a limit is a real rule. `numeric` for money, never
`float8`. `timestamptz` for every point in time, never plain `timestamp`. `bigint`
identity columns via `GENERATED ALWAYS AS IDENTITY`, not `SERIAL`. A `tstzrange` column
called `during` on `bookings` rather than a `starts_at`/`ends_at` pair — that choice is
what makes Stage 3 possible, and it is worth understanding now that you are choosing it
for that reason.

Then the constraints. Foreign keys on every relationship with an explicit `ON DELETE`
decision you can justify — and an index on every referencing column, by hand, because
Postgres does not create those for you. `CHECK` constraints for the rules that are per
row: a price is positive, a booking's range is not empty, a status is one of a known set
(as a `CHECK` on a `text` column, not an `ENUM`, and you should be able to say why).
`NOT NULL` on everything that is genuinely required, which is more columns than you will
first think.

Write the migration runner yourself: read `migrations/*.sql` in order, check a
`schema_migrations` table for what has already run, apply the rest each in a transaction,
record them. It should be about fifty lines. Writing it is what makes transactional DDL
concrete — you will notice that a failed migration leaves nothing behind, and that is a
Postgres property, not a property of your runner.

Finish the stage in `psql`, deliberately attacking your own schema. Insert a booking for
a resource that does not exist. Insert a negative price. Insert a NULL where you said not
null. Insert a row with `status = 'banana'`. Every one should be rejected with a specific
error, and you should read each error message properly, because those are the errors your
application will surface.

**Where it gets hard:** deciding what belongs in the database versus the application is a
genuine judgment call with no clean rule, and you will get some of it wrong and revisit it
in Stage 8. The other difficulty is `NULL`: three-valued logic is unintuitive, and the
first time a `CHECK` constraint fails to fire because the value was NULL — a check
evaluating to unknown *passes* — it will not be obvious why.

---

## Stage 2 — the API, in raw SQL

**Forces into use:** Node 3, and the first parts of Node 19.

**What works at the end:** a Fastify service where you can create a tenant, add
resources, list availability for a day, and create a booking over HTTP.

Build the smallest set of endpoints that make the product real. Creating a booking is the
interesting one; everything else is scaffolding. Availability — "which windows are free
for resource X on day D" — is the query that will teach you the most, because it is a
question about absence, and expressing absence in SQL is where most people's SQL stops.
You will need `generate_series` to produce candidate slots, a `LEFT JOIN` against existing
bookings, and a filter on the null side. Do this by hand; the shape of the query matters
later when you index it.

Every query is parameterised with `$1`, `$2`. Not for style — write down, explicitly in a
comment or in your notes, what the concatenated version would allow, so the reason is in
your head rather than in a lint rule. Then find the place where a parameter cannot help:
a sortable, user-supplied `ORDER BY` column on the bookings list. Solve it with an
allow-list, and note that this is the exception that proves the rule.

Set up the pool correctly from the start: a single `pg.Pool` created once at module
scope, `max` set to something small like 10, and a transaction helper that acquires,
`BEGIN`s, runs a callback, `COMMIT`s, `ROLLBACK`s on error, and **releases in a `finally`**.
Everything in Stage 9 depends on that helper being the only way transactions happen.

Turn on `log_min_duration_statement = 0` in the container for now, so every statement
appears in the log with its duration. You want to be in the habit of watching what the
application actually sends before you have any reason to care.

**Where it gets hard:** the availability query. Producing "free windows" rather than
"booked windows" requires thinking in terms of set difference, and the first working
version will probably be a loop in JavaScript, which is the wrong answer and worth
writing anyway so you can feel why.

---

## Stage 3 — the double-booking problem

**Forces into use:** Nodes 8, 10, 11, and range types from Node 14. This is the stage the
project exists for.

**What works at the end:** a concurrency test that fires N simultaneous requests to book
the same slot, and proves exactly one succeeds — with three different implementations
behind it, of which the first two fail.

Start by making it fail. Write the test first: twenty parallel HTTP requests, all booking
the same resource for the same hour, then count the rows. With the obvious implementation
— `SELECT` to check for a conflict, then `INSERT` if none — you will get somewhere between
two and twenty bookings for the same slot. Capture that output. It is the most valuable
artefact of the stage, because "I have personally produced a lost update on my own machine"
is a different sentence from "I know what a lost update is."

Then work out *why*, and this is where Node 8 becomes necessary rather than interesting.
Each request's `SELECT` ran in its own transaction with its own snapshot, taken before any
of the others committed. Every one of them correctly saw no conflict. MVCC did not fail;
it did exactly what it promises, and what it promises is not mutual exclusion. Read the
row versions directly — `SELECT xmin, xmax, * FROM bookings` — and see the transaction ids
that created each duplicate.

Now fix it three ways and keep all three in the repo, because the comparison is the lesson.

First, **serializable isolation**: run the whole booking transaction at `SERIALIZABLE`,
and watch conflicts surface as SQLSTATE `40001` errors rather than as bad data. Build the
retry wrapper — catch `40001` and `40P01`, retry the entire transaction with backoff, cap
the attempts — and put it in the transaction helper from Stage 2 so it applies everywhere
from now on. Note the cost: under twenty-way contention on one slot, most of those
transactions do work and throw it away.

Second, **explicit locking**: back at READ COMMITTED, take a lock on the *resource* row
with `SELECT ... FOR UPDATE` before checking availability, so the check-then-insert
becomes serialised per resource. This works, and it is worth noticing exactly what you
have done — you have made bookings for a single resource strictly sequential, which is
fine here and would not be fine if the lock were on the tenant.

Third, and best, **make the bad state unrepresentable**: an exclusion constraint.
`EXCLUDE USING gist (resource_id WITH =, during WITH &&)` tells the server that two rows
with the same resource and overlapping ranges may not coexist, and from that moment no
amount of concurrency, no application bug, and no manual `psql` session can create an
overlap. This is Node 2's thesis — a rule in the database is true, a rule in application
code is a hope — arriving with force. You will need the `btree_gist` extension for the
equality part of the constraint, and the failure now surfaces as a constraint violation
you translate into a 409 response.

Finish by running the same test at each isolation level and writing down which anomalies
you observed at each. That table is your first incident document.

**Where it gets hard:** understanding *why* the naive version failed, rather than just
observing that it did. The explanation requires holding snapshot semantics and statement
boundaries in your head at once, and it is the single hardest conceptual step in the whole
topic. Also expect the exclusion constraint's syntax to be genuinely unfamiliar — it is
the least Googleable thing here, and the error messages when you get the operator classes
wrong are unhelpful.

---

## Stage 4 — volume, and the first honest EXPLAIN

**Forces into use:** Nodes 4 and 6.

**What works at the end:** a seeder that fills the database to a configurable size, and a
documented `EXPLAIN (ANALYZE, BUFFERS)` for each of your main queries at ten thousand rows
and at ten million.

The seeder must produce *realistic* data, and the word doing the work is skew. Uniformly
random data is the enemy of learning here, because every query is equally selective and the
planner is never wrong. Real tenants are not equal: one has 40% of the bookings, most have
a handful. Real bookings cluster in business hours and in the recent past. Real statuses
are 90% `confirmed`. Build that skew in deliberately, because it is what makes statistics,
selectivity and the most-common-values list matter.

Then look at the physical reality of what you built. `pg_size_pretty(pg_total_relation_size('bookings'))`
against `pg_relation_size` — the gap is indexes and TOAST. `SELECT ctid, * FROM bookings LIMIT 5`
to see that rows have physical addresses. Count the pages: `relpages` in `pg_class`, times
8192 bytes, and check that it matches the file size. Find the data directory inside the
container and look at the actual file whose name is the `relfilenode`. None of this is
required to build the product; all of it is what makes the next six stages legible instead
of magical.

Now run `EXPLAIN (ANALYZE, BUFFERS)` on every query the API issues, at both sizes, and
save the output into `docs/plans/`. Read them properly: inside out, most-indented first;
`rows` versus `actual rows` on every line; `loops` on the inner side of any nested loop;
`shared hit` versus `shared read`. At ten million rows your availability query is doing a
sequential scan over the whole bookings table and you will be able to see, in page counts,
exactly how much work is being thrown away.

**Where it gets hard:** reading a plan is a genuine skill and the first ten are slow.
The specific thing that will confuse you is per-loop reporting — a node claiming 0.02 ms
that is actually responsible for most of the query's time because it ran two hundred
thousand times.

---

## Stage 5 — indexes, and being wrong about them

**Forces into use:** Node 5, Node 6 again, Node 16 (`pg_stat_statements`).

**What works at the end:** every API query on an index you chose deliberately, with a
before/after plan for each, and at least one documented case where your index made things
worse.

Install `pg_stat_statements` — which means `shared_preload_libraries` and a restart, so
you meet the class of extension that cannot be added live. Run the load generator for a
few minutes, then order by `total_exec_time` and see which query is actually costing you.
Expect a surprise: it is usually not the slow one you have been staring at, it is a fast
one running constantly.

Then index, from the queries backwards. The availability lookup wants a composite index,
and deciding the column order — `(resource_id, during)` — is where the leftmost-prefix
rule stops being abstract. The bookings list per tenant sorted by date wants
`(tenant_id, created_at DESC)`, and you should verify in the plan that the `Sort` node
disappears entirely, which is the payoff. The status filter, where 90% of rows are
`confirmed`, is a case for a **partial index** on the rare values — build both the full and
the partial and compare their sizes with `pg_relation_size`. A case-insensitive customer
email lookup needs an **expression index** on `lower(email)`, and it is worth first
confirming that the plain index is not used, so you see the failure before the fix.

Then deliberately be wrong, twice. Add an index on a low-selectivity column and watch the
planner refuse to use it — then confirm with `SET enable_seqscan = off` that it *could*,
and that it would be slower, and that the planner was right. Second, measure the write
cost: time a bulk insert of a hundred thousand bookings with two indexes and with eight.
That number is what "indexes make writes slower" actually means, and having measured it on
your own data is worth more than the sentence.

Finish by finding the foreign key with no index on the referencing side that you left in
deliberately at Stage 1, and watching a parent `DELETE` scan the child table.

**Where it gets hard:** composite index column order is genuinely subtle, and the failure
mode is quiet — the index is used, but only for the first column, and the plan looks fine
until you read the row counts. Also, resisting the urge to add indexes speculatively is
harder than it sounds once you have seen one work.

---

## Stage 6 — background work, with no Redis

**Forces into use:** Nodes 7, 11 (`SKIP LOCKED`), 15 (`LISTEN`/`NOTIFY`, triggers).

**What works at the end:** a `jobs` table, one or more worker processes, and reminder and
webhook jobs that are enqueued transactionally with the booking that caused them.

A booking should schedule a reminder and notify a fake external system. The naive
implementation does that inline in the request, which is wrong for a reason worth feeling:
put a two-second delay in the fake webhook call and watch your booking endpoint's latency
and your pool's in-use count both go through the floor, because a connection is held for
the whole call. That is Node 19's rule — never await something slow inside a transaction —
arriving as an observation rather than a warning.

So build a queue. A `jobs` table with a status, a run-after timestamp, an attempt count and
a JSONB payload. Workers claim work with `SELECT ... FOR UPDATE SKIP LOCKED LIMIT n` inside
a transaction — and the reason this pattern matters is worth testing directly: run four
workers at once, and confirm through the row locks that no job is ever claimed twice and
that no worker ever waits for another. Then handle failure honestly: attempt counts,
exponential backoff via `run_after`, and a dead-letter status after N attempts.

The property that makes this better than an external queue for this use case is
transactional enqueue. Insert the booking and insert its jobs in the *same* transaction. If
the booking rolls back, the jobs never existed — there is no window in which a reminder is
scheduled for a booking that does not exist. Write the equivalent BullMQ sequence next to it
in a comment and identify the exact failure window it has that yours does not. That
comparison is the `qbank` gap closing.

Add `LISTEN`/`NOTIFY` so workers wake immediately rather than polling every second, keeping
the poll as a fallback — and note precisely why the fallback is not optional: a worker that
was disconnected during the `NOTIFY` misses it forever, because notifications are not
persisted. Note also that this will break under PgBouncer in Stage 9, and that you will
have to decide what to do about it.

Finally add a trigger: `updated_at` maintained by the database on every table, and an
`audit_log` table written by an `AFTER` trigger on `bookings`. Then write down the argument
against putting anything more than that in a trigger.

**Where it gets hard:** getting retry semantics right. The gap between "the job ran" and
"the job's effects happened exactly once" is where idempotency lives, and you will need an
idempotency key on the webhook delivery to close it.

---

## Stage 7 — search, documents, and vectors

**Forces into use:** Node 14 in full, Node 16 (`pg_trgm`, `pgvector`).

**What works at the end:** three working search endpoints over the same data — exact,
fuzzy, and semantic — plus a webhook receiver that stores payloads verbatim.

Customers and bookings accumulate free text: names, notes, cancellation reasons. Make it
searchable three ways, and understand what each is for.

**Full-text search** first: a `tsvector` stored in a **generated column** so it maintains
itself, a GIN index on it, `websearch_to_tsquery` for user input (not `to_tsquery`, which
raises syntax errors on ordinary human strings), `ts_rank` for ordering and `ts_headline`
for snippets. Then find its limits deliberately: search for a misspelled name and get
nothing.

**Trigram search** second, with `pg_trgm`, to handle exactly that — `similarity()` and the
`%` operator, plus a GIN index that makes `ILIKE '%mar%'` indexable, which is the thing
Node 5 told you a B-tree can never do. Compare the two on the same query and articulate
when each is right.

**JSONB** third, for the fake payment provider's webhooks. Store the payload verbatim in a
`jsonb` column, because you did not design it and it will change. Then lift the two fields
you actually filter on — provider event id and status — into real typed columns with a
unique constraint on the event id, which is what makes webhook redelivery idempotent. That
hybrid is the whole design lesson of JSONB, and you should be able to state it: real
columns for what you reason about, JSONB for the rest. Add a GIN index and query with
`@>` so you have used containment properly.

**pgvector** last. Embed the free-text notes — any embedding API, or a deterministic fake
if you would rather not spend money — into a `vector` column, add an HNSW index, and build
"find similar notes" with the `<=>` cosine operator. The two things to actually understand
rather than copy: that this search is *approximate*, tuned by `hnsw.ef_search`, so recall
is a dial and not a guarantee; and that because the embedding is written in the same
transaction as the note, it can never be stale relative to it — which is the argument
against a separate vector database, stated concretely.

**Where it gets hard:** vector index tuning has no intuitive defaults, and measuring recall
requires computing exact nearest neighbours by brute force to compare against, which you
should do at least once on a small set so the word "approximate" has a number attached.

---

## Stage 8 — tenancy, and logic that cannot be bypassed

**Forces into use:** Node 15 in full, Node 2 revisited.

**What works at the end:** tenant isolation enforced by Postgres rather than by your
`WHERE` clauses, proven by a test that tries to break it with a deliberately buggy query.

Up to now every query has carried `WHERE tenant_id = $1`, and the isolation of your
tenants depends on nobody ever forgetting it. Prove that is fragile by writing an endpoint
that forgets it, and watching one tenant read another's bookings.

Then move the guarantee into the database with **row-level security**. `ALTER TABLE ...
ENABLE ROW LEVEL SECURITY` and a policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)`,
with the application setting `app.tenant_id` at the start of each request. Now re-run the
buggy endpoint and watch it return nothing. Understand precisely what you have arranged:
the setting is per session, the connection is pooled, so setting it must be part of
acquiring a connection and clearing it must be part of releasing one — and get that wrong
once on purpose, so you see one tenant's request run with another's setting still attached.
That is a real bug people ship, and it is worth having produced it yourself. Note that this
also interacts with Stage 9's pooler, and write down your prediction before you get there.

Then the reporting layer, which is where views earn their place. A **view** for "bookings
with resource and customer joined", so the shape lives in one place. A **materialized
view** for the tenant dashboard — revenue by month, utilisation by resource — which is a
genuinely expensive aggregation over the whole bookings table; time it as a plain query
first, then materialize it, then refresh it `CONCURRENTLY` and discover that this requires
a unique index. Decide how stale it is allowed to be and where the refresh is triggered
from, which is now a job in your Stage 6 queue.

Write the utilisation report with **window functions**, because it is the natural tool and
because this is the SQL that separates candidates: `ROW_NUMBER() OVER (PARTITION BY resource_id ORDER BY starts_at DESC)`
for the latest booking per resource, `LAG` to compute the gap between consecutive bookings,
a running revenue total with `SUM(...) OVER (ORDER BY month)`. And a **recursive CTE** if
you add resource groups — a court belongs to a section belongs to a venue — because walking
that hierarchy in one query is the thing recursive CTEs are for.

**Where it gets hard:** RLS plus connection pooling is a genuine footgun and the failure is
silent and catastrophic — the wrong tenant's data, with a 200 status code. Getting the
session-variable lifecycle exactly right, and writing a test that would catch it if you
broke it, is the real work of this stage.

---

## Stage 9 — migrations and pooling, under live traffic

**Forces into use:** Nodes 12 and 13, Node 11 revisited.

**What works at the end:** a written migration playbook in the repo, backed by
before/after evidence from your own load tests, and PgBouncer in front of the database
with every incompatibility resolved.

This stage has one rule that makes it work: **the load generator is running the whole
time.** Every migration below is applied to a database serving traffic, and the difference
between the safe and unsafe version is measured in your load generator's error count and
p99 latency, not asserted.

Start with the pool. Raise the load generator's concurrency until requests start failing,
and identify which failure you hit — pool exhaustion (requests queuing in Node, database
idle) or `FATAL: sorry, too many clients already` (your `max` times your process count
exceeding `max_connections`). Do the arithmetic explicitly. Then find the throughput curve:
run the same load at `max` of 5, 20, 50 and 200 and plot latency. It will get worse past a
point, and having produced that curve yourself is one of the more convincing things you can
describe in an interview.

Then put **PgBouncer** in front in transaction mode and watch things break in an
instructive order. Server-side prepared statements fail, which you fix in the driver.
`LISTEN`/`NOTIFY` from Stage 6 stops working, which is why you kept the polling fallback.
Your Stage 8 RLS session variable becomes a correctness bug if it is set per session rather
than per transaction. Fix each, and write down what transaction pooling actually forbids —
that list is a very good interview answer.

Now the migrations, each done wrong first and then right, with the load running:

Add a nullable column, and observe that it is instant. Add one with `DEFAULT gen_random_uuid()`
and watch it rewrite the table and stall everything — then do it the safe way. Add `NOT NULL`
to a populated column directly and watch the lock queue form; then do it as `CHECK ... NOT VALID`,
`VALIDATE CONSTRAINT`, `SET NOT NULL`. Build an index with plain `CREATE INDEX` and watch writes
block; then `CONCURRENTLY`, then deliberately kill it halfway and find the `INVALID` index left
behind in `pg_index`. Change a column from `integer` to `bigint` the naive way, then properly
via expand–migrate–contract with a batched backfill that commits between batches.

And run the experiment that matters most: open a transaction in `psql` that just holds a
`SELECT` on `bookings`, then run a trivial `ALTER TABLE` from another session, and watch
every subsequent query in the load generator pile up behind an `ALTER` that has not even
started. Capture `pg_stat_activity` and `pg_blocking_pids` output while it is happening.
Then set `lock_timeout` and demonstrate the difference. That is the single most useful
production story in this whole project.

**Where it gets hard:** the batched backfill. Getting the batching predicate right so it
makes progress, does not rescan, does not deadlock with live traffic, and can be resumed
after interruption is a real piece of engineering, and the naive version will either loop
forever or lock everything.

---

## Stage 10 — the disaster lab

**Forces into use:** Nodes 9, 17, 18.

**What works at the end:** `docs/incidents/` with a written post-mortem for each planted
failure, a working primary/standby pair, and a database you have restored to a specific
timestamp.

Every failure here is planted on purpose, because waiting for them would take a year.

**Bloat and vacuum.** Run an update-heavy load until the table's physical size far exceeds
its data, confirming with `n_dead_tup` in `pg_stat_user_tables`. Then defeat autovacuum
deliberately: open a `psql` session, `BEGIN`, run one `SELECT`, and leave it. Watch dead
tuples climb while autovacuum runs and reclaims nothing, and find the culprit through
`pg_stat_activity` where `state = 'idle in transaction'`. Fix it, tune
`autovacuum_vacuum_scale_factor` per table, and reclaim the space with `pg_repack` — then
try `VACUUM FULL` on a copy and time how long the table is completely unavailable, so the
difference is a number. Finally set `idle_in_transaction_session_timeout` so it cannot
happen again, which is the fix you should have shipped in Stage 2.

**Freezing.** You will not reach four billion transactions, but you can watch the
mechanism: query `age(relfrozenxid)` per table, generate transactions in a loop, and see it
move. Lower `autovacuum_freeze_max_age` on a scratch database to something small and watch
an anti-wraparound vacuum trigger.

**Locks and deadlocks.** Produce a deadlock on purpose — two transactions updating two
bookings in opposite orders — read the server's deadlock report, and note that the fix is
ordering, not cleverness. Then confirm your Stage 3 retry wrapper handles it.

**Observability.** Write the queries you would run in an incident and keep them in
`docs/runbook.sql`: long-running queries, idle-in-transaction sessions, blocking chains,
top queries by total time, tables by size, indexes never used, cache hit ratio, replication
lag. Then have a friend — or a script — break something while you are not looking, and time
yourself finding it using only that file.

**Replication.** Add a standby to Docker Compose with `pg_basebackup` and streaming
replication. Confirm reads work on it. Then reproduce read-your-writes: write to the
primary, immediately read from the standby, and get stale data — under load, reliably.
Measure the lag in `pg_stat_replication`. Then make it synchronous, measure the commit
latency you paid, and finally kill the standby and watch the primary stop accepting writes,
which is the trap nobody mentions.

**Point-in-time recovery.** Turn on WAL archiving, take a base backup, run traffic, note
the time, then run `DELETE FROM bookings` with no `WHERE` and commit it. Restore the base
backup into a fresh container and replay WAL to one second before the delete. Getting your
data back from your own mistake, with a `recovery_target_time` you chose, is the moment the
WAL stops being a diagram. Then write down your actual RPO and RTO as numbers, measured.

**Where it gets hard:** PITR is fiddly and unforgiving — archive commands fail silently,
the recovery configuration changed shape in Postgres 12, and the first three attempts
will not work. That is the point; a backup you have not restored is not a backup, and this
is where you find out.

---

## Coverage table

| Landscape node | Stage(s) | How it's forced |
|---|---|---|
| 0 — before a database | 1 | Framing only, honestly. Not "forced" — it is the motivation for Stage 1's constraint work. |
| 1 — a server that owns the data | 1, 4 | Container, data directory, `psql`, cluster/database/schema, and looking at the actual relfilenode file in Stage 4. |
| 2 — types and constraints | 1, 3, 8 | Stage 1 designs the invariants; Stage 3 proves an application-level rule fails where a constraint does not. |
| 3 — SQL as a question | 2 | Availability query, joins, aggregates, `ON CONFLICT` for idempotent webhook writes. |
| 4 — pages, tuples, heap | 4 | Direct inspection: `ctid`, `relpages` × 8192 against file size, TOAST on the notes column. |
| 5 — indexes | 5 | Every API query indexed deliberately; composite order, partial, expression, covering; two documented mistakes. |
| 6 — planner and EXPLAIN | 4, 5, 9 | Plans captured at two data sizes and before/after every index; `work_mem` spill observed under load. |
| 7 — transactions and WAL | 6, 10 | Transactional enqueue in Stage 6; WAL archiving and replay in Stage 10's PITR. |
| 8 — MVCC | 3, 10 | Stage 3 reads `xmin`/`xmax` on the duplicate rows it produced; Stage 10 watches dead versions accumulate. |
| 9 — vacuum and bloat | 10 | Planted: update churn, then a deliberate idle-in-transaction session that stalls autovacuum. |
| 10 — isolation levels | 3 | Same concurrency test run at all three levels, anomalies recorded per level. |
| 11 — locks and deadlocks | 3, 6, 9, 10 | `FOR UPDATE`, `SKIP LOCKED`, the `ALTER TABLE` lock queue under load, a deliberate deadlock. |
| 12 — connections and pooling | 9 | Throughput curve measured across pool sizes; PgBouncer transaction mode breaks prepared statements, NOTIFY and RLS. |
| 13 — migrations | 9 | Six migrations each done unsafely then safely, with the load generator running. |
| 14 — unusual types | 1, 3, 7 | `tstzrange` + exclusion constraint (Stage 3), JSONB, arrays, FTS generated column, `pg_trgm` (Stage 7). |
| 15 — logic in the database | 6, 8 | Triggers, `LISTEN`/`NOTIFY`, views, materialized view, window functions, recursive CTE, RLS. |
| 16 — extensions | 5, 7, 10 | `pg_stat_statements` (with the restart), `btree_gist`, `pg_trgm`, `pgvector`, `pg_repack`. **Not covered:** PostGIS, TimescaleDB, Citus — nothing in this domain needs them; they stay [AWARE]. |
| 17 — observability and config | 5, 9, 10 | `docs/runbook.sql` written and then used under a timed, blind incident. |
| 18 — backups, replication, scale | 10 | Standby, measured lag, read-your-writes reproduced, synchronous trade-off measured, PITR restore performed. **Partially covered:** partitioning is optional extra credit on the `audit_log` table; sharding and failover tooling (Patroni) stay [AWARE]. |
| 19 — the application boundary | 2, 6, 9 | Pool and transaction helper from Stage 2, the slow-call-inside-a-transaction failure in Stage 6, retries and timeouts throughout. |

---

## What this proves in an interview

- "I produced a lost update on my own machine — twenty concurrent requests booked the same slot — and then fixed it three ways: serializable with a retry loop, `SELECT FOR UPDATE`, and finally a GiST exclusion constraint on a `tstzrange`, which is the only one that makes the bad state unrepresentable."
- "I ran a trivial `ALTER TABLE` against a table with an open read transaction on it while a load generator was running, and watched every subsequent query queue behind DDL that had not even started. That is why I set `lock_timeout` on every migration."
- "I measured the throughput curve against pool size — 5, 20, 50, 200 connections — and it gets worse past about twice the core count, because Postgres forks a process per connection."
- "I defeated autovacuum on purpose with a single idle-in-transaction session and watched dead tuples climb while autovacuum ran and reclaimed nothing. Now `idle_in_transaction_session_timeout` is the first thing I set on a new database."
- "I deleted every row in my bookings table on purpose and restored to one second before it with point-in-time recovery. It took me three attempts to get the archive command right, which is exactly why you rehearse it."
- "Our search went through three iterations: full-text with a GIN index on a generated tsvector column, then `pg_trgm` for typo tolerance because FTS returns nothing for a misspelled name, then pgvector with HNSW for semantic matches — and I measured recall against brute-force nearest neighbours so I knew what 'approximate' cost me."
- "I moved tenant isolation from `WHERE` clauses into row-level security, and then broke it on purpose by leaking a session variable across a pooled connection, which is the failure mode nobody warns you about."
- "I built the job queue on `FOR UPDATE SKIP LOCKED` rather than Redis specifically so the job and the booking that caused it commit in the same transaction. I can tell you the exact window that BullMQ has and this does not."

---

## Repo

**Name:** `slotline`
**Visibility:** public

**README should lead with:** the double-booking incident. Two code blocks, side by side —
the concurrency test output showing seven bookings created for one slot, and the same test
after the exclusion constraint showing one success and nineteen 409s — above a one-line
link to `docs/incidents/`. A reviewer understands the entire value of the project in about
fifteen seconds, and it demonstrates the one thing most candidates cannot: that you have
personally produced a concurrency bug and closed it at the right layer.

```bash
cd ~
mkdir slotline && cd slotline
git init
# scaffold as Stage 1 describes
git add .
git commit -m "chore: initial scaffold"
gh repo create slotline --public --source=. --remote=origin --push
```
