# shortlist — the JavaScript mastery project

**Status:** spec complete, not started. Phase 4 output; Phase 6 (build) has not begun.

## What you're building

`shortlist` is a job-hunt aggregator you will actually run. It pulls open roles from
public job-board APIs that companies already expose — Greenhouse and Lever publish
unauthenticated JSON per company, Hacker News "Who is hiring" is queryable through the
public Algolia API, and several remote boards publish open JSON feeds — normalises
wildly different payload shapes into one record type, deduplicates roles appearing on
three boards at once, extracts structured facts (salary range, currency, tech stack,
remote/onsite, posted date) from unstructured description text, scores each role against
a profile you define, and tracks which ones you've applied to and at what stage.

It ships as two things over one shared core: a **CLI** (`shortlist scan`, `watch`,
`apply <id>`) and a **browser dashboard** reading the same data. Both import the same
core module. That dual-target requirement forces the question of what "JavaScript"
actually means in two different runtimes.

**Deliberately easy:** no server, no database, no auth, no deployment. Data lives in a
JSON file for the CLI and `localStorage` for the browser. Hand-written HTML and CSS, no
framework. **No TypeScript for the entire project, on purpose** — every place types
would have helped, you feel the absence, and Stage 10 deals with it deliberately.

**Genuinely non-trivial:** data arrives in inconsistent shapes from sources you don't
control, at volumes that matter, over networks that fail, with mixed timezones and
currencies — while your own requirements change weekly.

## Why this project for this topic

A todo app can be finished touching maybe six of the nineteen nodes. `shortlist` is
slow (network), large (thousands of records), long-running (a `watch` mode left open for
days), untrusted (third-party payloads), and dual-runtime. Those four properties force
the second half of the landscape.

Nodes that would otherwise be skipped, and what prevents skipping:
- **Generators (12)** — boards paginate; you cannot hold every page in memory
- **Metaprogramming (16)** — the dashboard needs reactivity and frameworks are banned,
  so you build it with a `Proxy`, which is how Vue does it
- **Memory and GC (15)** — a dedicated disaster stage plants leaks and hunts them
- **Prototypes and `this` (5, 6)** — per-board adapters are a real class hierarchy, and
  passing an adapter method as a callback produces the detached-`this` `TypeError`
- **Runtimes (17)** — the same core must run under `worker_threads` and under `Worker`

Closes a named gap: qbank contains promise-based Drizzle calls, a BullMQ queue whose
retries depend on how a rejected promise is read, and streaming Anthropic calls — all
built from Nodes 9–12, all vibe-coded. This makes you build those shapes yourself.

## The stack

- **Node 20+** — native `fetch`, ESM, `worker_threads`, top-level `await`,
  `structuredClone`
- **No framework anywhere.** No React, no Express, no ORM
- **No TypeScript** until Stage 10, and even then JSDoc + hand-rolled validators
- **Vite** for the browser build only — gives ESM in dev and a legacy plugin, which is
  what makes transpiling-vs-polyfilling concrete at Stage 10
- **Zero runtime dependencies in the core.** Rate limiter, retry, validator, reactive
  store, fuzzy matcher are all yours. Where a team would install `p-limit`, `zod` or
  `date-fns`, note which, then build the small version anyway
- **Vitest** from Stage 3, lightly
- **Storage:** `~/.shortlist/db.json` for the CLI, `localStorage` for the browser — both
  primitive on purpose so JSON's limits bite honestly

---

## Stage 1 — one board, one file, printed to a terminal

**Forces:** Nodes 1, 2, 3, 8, 10, 11, 13, 14
**Works at the end:** `node src/cli.js` fetches one company's live Greenhouse board and
prints formatted roles.

Start with one ESM file and a hardcoded URL. Fetch, `await response.json()`, print. Then
make it less naive: check `response.ok` before parsing (a 404 returns valid JSON you'd
otherwise print as data), and wrap the parse in `try`/`catch` (a maintenance page throws
`SyntaxError`). Build `normalise(rawJob)` returning your own record — keep `raw`, you
need it at Stage 5. Split into `fetch.js`, `normalise.js`, `format.js`, `cli.js` and set
`"type": "module"` before the stage ends.

**Where it gets hard:** tolerating how much of the payload you don't understand. Resist
normalising everything. And `await` will *feel* like blocking — it isn't, and Stage 3
makes that visible.

## Stage 2 — many boards, many shapes, one interface

**Forces:** Nodes 3, 5, 6, 2
**Works at the end:** `shortlist scan` pulls three structurally different sources into
one merged list.

Lever's JSON is not Greenhouse's. Your `normalise` can't serve both without an
`if (source === …)` staircase — that mess is why this stage exists. Build a base
`Source` class with `fetchRaw()` and `scan()`; each concrete source implements only
`buildUrl()` and `normaliseOne()`. Use `#private` fields and a `static` factory.

**Where it gets hard:** deciding where base ends and subclass begins. You'll get it wrong
twice. That churn *is* the lesson about composition over inheritance.

## Stage 3 — everything at once, and everything failing

**Forces:** Nodes 10, 8, 4, 9
**Works at the end:** all sources scanned concurrently, failures isolated, retries with
backoff, rate limit respected.

Eight sources awaited in a loop take 3.5 s for 400 ms of work. Fix by starting all and
awaiting together — but `Promise.all` is **wrong** here: one dead board loses the seven
that worked. Use `allSettled`. Add `Promise.race` against a rejecting timer, because a
board that *hangs* is worse than one that fails. Build the error taxonomy
(`NetworkError`, `RateLimitError`, `ParseError`, `SourceUnavailableError`) so retry
policy can differ per kind. Write `withRetry(fn, opts)` and `createLimiter(n)` as
closures. Add a `setInterval` spinner — it animates, proving `await` didn't block; then
insert a synchronous 3-second loop and watch it freeze.

**Where it gets hard:** backoff-with-jitter, and not flattening `allSettled`'s
`{status, reason}` too early — the `reason` is what your error classes need.

## Stage 4 — pagination, streaming, and not holding everything

**Forces:** Nodes 12, 7
**Works at the end:** paginated sources consumed page by page; `--limit 50` stops
fetching the moment it has enough.

Give `Source` an `async *pages()` and an `async *jobs()`. Consume with `for await`. Make
a `JobSet` class iterable with `*[Symbol.iterator]()`. Stream to disk as NDJSON.

**Where it gets hard:** composing async generators *concurrently* is genuinely awkward
with no elegant built-in — you'll write something clumsy, which is correct. Note what
`it-merge` exists to solve. And decide deliberately whether one bad page ends the
iteration or is skipped.

## Stage 5 — normalisation, dedup, and extracting facts from prose

**Forces:** Nodes 7, 14, 1, 2
**Works at the end:** one role on three boards appears once; salary, currency, tech and
remote status extracted; dates and money formatted correctly.

Dedup via a `Map` keyed on a computed fingerprint (case-folded, punctuation-stripped,
`normalize`d) — replacing identity comparison with a structural one you defined. `Set`
for tags. `reduce` or `Object.groupBy` for stats. Regex with named groups for salary
(`$120k–$160k`, `₹18,00,000 PA`, `€90.000`), and hit the `/g` `lastIndex` trap for real.
**Do the money arithmetic wrong with floats first, look at the output**, then store
integer minor units + currency code and format with `Intl.NumberFormat`.

**Where it gets hard:** deduplication has no correct answer — you'll over- and
under-merge for weeks. Salary regex will never reach 100%; decide what "good enough,
fail visibly" means.

## Stage 6 — the freeze, and moving work off the thread

**Forces:** Nodes 9, 11, 17
**Works at the end:** scoring runs in a worker pool; the CLI stays responsive.

Score naively and synchronously first — the spinner freezes solid. Try the tempting
wrong fix (sprinkling `await`) and observe it does nothing, because there's no I/O to
overlap. Then chunk across `setTimeout(fn, 0)` — it unfreezes but is slower, and behaves
differently from promise chunking because microtasks drain before the next macrotask.
Then `worker_threads` with a pool sized to `os.cpus().length`.

**End the stage with the drill:** a file mixing `console.log`, `setTimeout`,
`Promise.resolve().then`, `queueMicrotask` and `process.nextTick`. **Predict the output
in writing**, then run it. Repeat until you can derive it.

**Where it gets hard:** clean pool shutdown, propagating a worker error usefully, and
backpressure. Also `DataCloneError` when you send something unclonable.

## Stage 7 — the same core, in a browser

**Forces:** Nodes 13, 17, 3, 5, 7
**Works at the end:** a dashboard showing scored roles, filterable and sortable, sharing
the core.

Split `core/` (pure), `node/` (fs, workers, CLI), `web/` (DOM, storage). Importing
`core/` into the browser reveals what leaked — a stray `node:fs`, a `process.env`. Use
event delegation, a closure-based debounce, and the browser's `new Worker()`.

**Where it gets hard:** keeping `core/` runtime-agnostic requires discipline. The clean
answer is dependency injection — the core takes a storage interface it doesn't own.

## Stage 8 — reactive state without a framework

**Forces:** Nodes 16, 3, 4
**Works at the end:** changing state re-renders exactly the affected part.

Build `reactive(target)` with a `Proxy`: `get` records dependencies, `set` notifies. Plus
`effect(fn)`. About sixty lines — essentially Vue's reactivity core. Add computed values
via getters memoised with closures, `Object.defineProperty` with `enumerable: false` for
bookkeeping, and a `Symbol` for internal metadata keys.

**Where it gets hard:** nested reactivity (lazy vs eager proxying is a real trade-off),
and effect cleanup — without it you've built Stage 9's leak on purpose.

## Stage 9 — the deliberate disaster: hunting your own leaks

**Forces:** Nodes 15, 4, 2
**Works at the end:** `watch` runs for days at flat memory; you can name, demonstrate and
fix four leak classes.

On a scratch branch, plant each deliberately: an unremoved listener; an uncleared
interval per scan cycle; an unbounded memo cache; a detached DOM reference. Diff heap
snapshots minutes apart and read the retaining path. Fix with `AbortController`,
`clearInterval`, an LRU bound, and a `WeakMap` keyed on the job object.

**Where it gets hard:** reading a retainer chain the first time is disorienting. And
proving a fix requires comparing steady state after forced GC, not eyeballing a graph.

## Stage 10 — shapes, boundaries, and shipping

**Forces:** Nodes 18, 17, 13, 8
**Works at the end:** a board changes shape and you get a precise error at the boundary;
the core is published, consumable from ESM and CJS; the dashboard runs in an old browser.

Write a validator by hand — a schema as a plain object, `validate(schema, value)`
returning a typed record or a `ValidationError` listing every failing field with its
path. Apply at **exactly three boundaries**: after `JSON.parse` of a network payload,
after reading the database file, after reading `localStorage`. Nowhere else. Then JSDoc
`@typedef` with `checkJs` in `jsconfig.json`. Publish with an `exports` map serving both
module systems; break semver deliberately. Add a `browserslist` target and Vite's legacy
plugin, then find **one transpiled syntax** and **one polyfilled function** in the output.

**Where it gets hard:** dual ESM/CJS publishing is one of the genuinely unpleasant
corners of the ecosystem. You will lose an hour to `ERR_REQUIRE_ESM`. That hour is the
point.

---

## Coverage

| Node | Stage(s) | How it's forced |
|---|---|---|
| 0 Before JavaScript | — | **Not covered** — historical framing, uncoverable by building |
| 1 Values, types, coercion | 1, 5 | `undefined` fields; `\|\|` vs `??`; money as integer minor units |
| 2 Objects and references | 1, 2, 5 | shared `raw` mutated from two adapters; `structuredClone` for dedup |
| 3 Functions as values | 1, 2, 3, 8 | `map`/`filter`; `withRetry`, `createLimiter`; `effect(fn)` |
| 4 Scope and closures | 3, 8, 9 | retry counters, limiter queue, debounce, memoised computeds — and the leak mechanism |
| 5 `this` and call context | 2, 7 | detached adapter method; again with `addEventListener` |
| 6 Prototypes and classes | 2 | `Source` base + subclasses, `#private`, `static` factory |
| 7 Collections and iteration | 4, 5, 7 | `Map` fingerprints, `Set` tags, `reduce` stats, custom `Symbol.iterator` |
| 8 Errors and failure | 1, 3, 10 | error hierarchy driving retry policy; `cause`; boundary validation |
| 9 Event loop | 3, 6 | spinner proves `await` doesn't block; sync scoring freezes it |
| 10 Promises | 3 | `allSettled` over `all` because partial results matter; `race` timeouts |
| 11 async/await, microtasks | 3, 6 | serialised-awaits bug; predict-the-order drill |
| 12 Generators, async iteration | 4 | pagination as `async *pages()`; `--limit` proves laziness |
| 13 Modules | 1, 7, 10 | ESM from day one; core/node/web split; dual publish |
| 14 Standard library | 5 | regex named groups and `lastIndex`; `Intl`; JSON round-trip losses |
| 15 Memory and GC | 9 | four planted leaks, found in heap snapshots, fixed |
| 16 Metaprogramming | 8 | `Proxy` reactivity; getters; `Symbol`; `defineProperty` |
| 17 Moving target, runtimes | 6, 7, 10 | `worker_threads` vs `Worker`; runtime-agnostic core; transpile vs polyfill |
| 18 What JS can't tell you | 10 | a source changes shape; hand-rolled validator + JSDoc `checkJs` |

Eighteen of nineteen nodes forced by construction.

## Repo

**Name:** `shortlist` · public
**README leads with:** a terminal recording of `shortlist scan` pulling eight boards
concurrently with the progress counter moving, then a screenshot of the dashboard sorted
by score.

```bash
cd ~ && mkdir shortlist && cd shortlist
git init && npm init -y && npm pkg set type=module
mkdir -p src/core src/node src/web
git add . && git commit -m "chore: initial scaffold"
gh repo create shortlist --public --source=. --remote=origin --push
```
