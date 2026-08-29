# triage — the client-data-fetching mastery project

**Status:** spec complete, not started. Phase 4 output; Phase 6 (build) has not begun.

## What you're building

`triage` is an issue triage console for GitHub. You point it at a set of repos — yours,
plus a few busy open-source ones — and it becomes a single queue you work through:
filter by label, assignee, age and state; open an issue and read its timeline; then act
on it — label it, assign it, comment, close it — without leaving the queue. It is the
kind of internal tool a maintainer or a support-adjacent team builds in a week and then
uses every day, and a reviewer understands what it is from one screenshot.

The crucial property is that **you do not own the data**. The authority is
`api.github.com`. Other people are changing these issues while your screen is showing
them. You can prove it in ten seconds: open github.com in another tab, add a label, and
watch your console be confidently wrong. That is Node 5's entire thesis made physical,
for free, in a real system — not a simulation of shared state, actual shared state.

The second property is that the upstream is genuinely hostile in useful ways. GitHub
rate-limits you (5,000 requests/hour authenticated, and a separate, much stricter
secondary limit on writes), returns `403` with `X-RateLimit-Remaining: 0` where you
expected `429`, paginates with `Link` headers on REST and cursors on GraphQL, and will
occasionally just be slow. You do not have to invent failure conditions. You do have to
survive them.

**Deliberately easy:** the application logic is trivial — lists, a detail pane, four
write actions. There is no business domain to model, no database schema to design, no
algorithm. Styling is Tailwind and stays plain. Everything difficult in this project is
data fetching, which is the point.

**Genuinely non-trivial:** data you don't control, changing underneath you, arriving
late and out of order, in volumes that don't fit one response, over a network that fails,
from an API that rate-limits, for two different signed-in accounts, with writes that must
feel instant and must not lie.

## Why this project for this topic

Most tutorial projects for this topic are read-only lists against a stable fake API, and
you can finish them touching maybe six of the twenty nodes. `triage` has four properties
that force the rest: **the data is externally owned and externally mutated**, **the
upstream really does rate-limit and really is sometimes slow**, **there are writes with
real consequences**, and **there are two signed-in identities**.

Nodes that would otherwise be easy to skip, and the specific mechanism that prevents
skipping each:

- **Node 4 (the four failures)** — Stage 2 is a dedicated disaster stage. You build a
  chaos layer into your own backend-for-frontend (`?_delay`, `?_fail`, `?_reorder`) and
  reproduce the out-of-order race deliberately, on video, before you are allowed to fix
  it. You cannot hand-wave a bug you have recorded.
- **Node 15 (real time)** — a webhook receiver in the BFF turns real GitHub events into
  a real SSE stream. The event source is another human on the internet, not a timer you
  wrote.
- **Node 17 (cache safety)** — two GitHub accounts in two browser profiles, and a
  deliberate reproduction of the logout leak before the one-line fix. Multi-tenancy with
  a second real identity, not a mocked one.
- **Node 13 (the server boundary)** — the GitHub token must never reach the browser, so
  a server-side data path is a security requirement, not an exercise. Prefetch and
  hydrate falls out of that constraint.
- **Node 16 (normalisation)** — the same issue object arrives in the list response and
  in the detail response with different fields. You will watch two copies of issue #482
  disagree in the devtools, which is the document-cache weakness you otherwise only read
  about.
- **Node 18 (offline)** — you will write a comment on a train. That is the requirement.

**Closes a named gap:** the BFF is Fastify + TypeScript — the qbank stack. Token
exchange, a proxy layer, a webhook receiver, SSE streaming and rate-limit handling are
all shapes that exist in qbank in vibe-coded form. Here you build them yourself, small,
and can explain every line.

## The stack

**Frontend**

- **Next.js (App Router), TypeScript** — you need RSC and hydration for Stage 8, and
  Next is what job postings ask for. Stages 1–7 run in client components only; the
  server boundary is introduced deliberately at Stage 8, not assumed from the start.
- **TanStack Query v5** + **@tanstack/react-query-devtools**. The devtools panel is open
  in every screenshot in this project. Pin v5 explicitly — v4 material is everywhere and
  the `isPending`/`gcTime` renames will bite you.
- **Tailwind CSS**, plain. No component library. Styling is not the subject.
- **@tanstack/react-virtual** at Stage 10, not before.
- **@tanstack/query-persist-client-core** + an IndexedDB persister at Stage 11.

**Backend-for-frontend**

- **Fastify + TypeScript.** Its jobs: hold the GitHub token, proxy REST and GraphQL,
  inject chaos on demand, receive webhooks, and stream SSE. Perhaps 400 lines total.
- **No database.** Webhook events live in an in-memory ring buffer. Saved views live in
  a JSON file. If you find yourself designing a schema, you have drifted off topic.
- **`@octokit/*` is banned.** You call `api.github.com` with `fetch`. The whole point is
  that you understand the request.

**Testing**

- **Vitest + @testing-library/react + MSW.** MSW handlers double as the offline dev
  server, so you can build without burning rate limit.

**Deliberately absent:** no Redux, no Apollo, no axios (until you deliberately compare
one at Stage 5), no ORM, no auth library. Where a team would install something, note
which, then do the small version yourself.

---

## Stage 1 — The queue, built the wrong way on purpose

**Forces into use:** Nodes 0, 1, 2, 3

**What works at the end:** a page listing open issues for one repo, filterable by label,
with a spinner and an error state. It works. It is also wrong in four ways you cannot
yet see.

Start with a genuinely server-rendered version and no client JavaScript at all: a Next
server component that fetches the issue list, and a filter implemented as a plain link
that changes the URL. Use it for five minutes. Change the filter and watch the whole page
go white and come back; scroll halfway, change the filter, and lose your place. This is
Node 0, and it takes twenty minutes to build and is worth every one of them, because
every later stage is an answer to something you felt here.

Then rebuild the same screen as a client component with `useState` and `useEffect` and
raw `fetch` — the exact pattern from Node 3, the loading triad and all. Handle the
things `fetch` will not handle for you: check `res.ok`, read the error body before you
throw, attach the status to the error you throw, and set a timeout with
`AbortSignal.timeout`. Add the label filter as a dependency of the effect.

You are not allowed to install TanStack Query in this stage. Write the thirty lines. Then
write them again for a second component — a header showing the open-issue count — because
you will need two components reading the same data in Stage 2.

**Where it gets hard:** GitHub's error responses are more varied than the tutorial shape.
An unauthenticated request to a private repo is a `404`, not a `403`, deliberately, so
you cannot enumerate private repos. A rate-limited request is a `403` with
`X-RateLimit-Remaining: 0`, not a `429`. A malformed query is a `422` with a structured
`errors` array. Getting `res.ok` and error-body parsing right here is most of the stage,
and it is exactly the work `fetch` refuses to do for you.

---

## Stage 2 — The disaster stage: reproduce all four failures

**Forces into use:** Node 4, and Node 2's `AbortController`

**What works at the end:** a written `FAILURES.md` in the repo with four reproductions —
each one a recording or a screenshot sequence plus the exact steps — and then a fixed
version of Stage 1's component that survives all four.

First build the chaos layer in the Fastify BFF: a proxy route that forwards to GitHub but
honours query parameters `_delay=ms`, `_fail=status`, and `_failRate=0.3`. Twenty lines.
It stays in the project permanently and is used again in Stages 9 and 11.

Now reproduce, in this order, and record each one **before** fixing it:

**The race.** Point the console at two repos. Make the first repo's request slow
(`_delay=1500`) and the second fast. Click repo A then repo B. Watch repo A's issues
appear under repo B's header and stay there. Then do it again with DevTools throttled to
Slow 3G and no chaos parameters at all, to prove it is not an artefact of your proxy.

**The unmounted write.** Navigate away mid-request. Log in the `.then` to show it still
runs, and reason about what it is holding alive.

**The Strict Mode double-invoke.** Confirm `<StrictMode>` is on, watch two requests in
the network tab, then write down why the `useRef` guard you were tempted by is the wrong
fix.

**The disagreement.** Your list component and your header count component both fetch the
same endpoint. Make the header's request fast and the list's slow, then close an issue on
github.com and refresh only one of them. Screenshot the two numbers disagreeing on one
screen.

Only now fix them: `AbortController` in the effect cleanup, `AbortError` handled as a
normal outcome rather than an error, and a note in `FAILURES.md` stating plainly that the
fourth failure has no fix at this layer.

**Where it gets hard:** the race is genuinely fiddly to reproduce on purpose the first
time, because your instinct is to click faster when the actual requirement is a slow
first request and a fast second one. And when you do fix it, verifying the fix requires
the same setup again — so build the chaos controls into the UI (a little dev panel), not
into URLs you retype.

---

## Stage 3 — Adopt the cache

**Forces into use:** Nodes 5, 6

**What works at the end:** the same screen, with the triad and the effect deleted, one
network request where there used to be two, and the devtools panel showing one entry with
two observers.

Install TanStack Query. Create the `QueryClient` once — module scope or
`useState(() => new QueryClient())`, and write down in a comment why creating it in the
component body would silently discard the cache on every render.

Build a **query key factory** before you write your second query, not after. A module
exporting `issueKeys.all`, `issueKeys.list(repo, filters)`, `issueKeys.detail(repo, n)`,
`issueKeys.timeline(repo, n)`. Every key hierarchical, every key containing every input
its fetcher reads. This module is what makes Stage 5's invalidation a one-liner, and
skipping it is how key hierarchies silently drift apart.

Convert the list and the header count to `useQuery` against the same key. Open the
network tab and confirm one request. Open the devtools and confirm one entry with two
observers. Then prove structural sharing: refetch with no upstream change, and show — with
a `console.log(prev === next)` or a render counter — that nothing re-rendered.

Finally, write the paragraph. In the repo README, in your own words: why the issue list is
not state this app owns. If you cannot write that paragraph, the rest of the project will
be cargo cult.

**Where it gets hard:** the honest difficulty is restraint. Every instinct will be to keep
some of the old state around "just in case" — a local copy for optimistic edits, a
`useState` mirror to avoid a re-render. Every one of those is the Node 5 category error
sneaking back in. Delete them.

---

## Stage 4 — A freshness policy you can defend

**Forces into use:** Nodes 7, 8

**What works at the end:** a `CACHING.md` table with one row per query key, its
`staleTime`, and the one-sentence domain argument for that number; and a UI where the
first load is a skeleton and every subsequent load is nearly invisible.

Set nothing globally at first. Watch the default `staleTime: 0` behaviour: mount, tab
away, tab back, and count the requests. Then set defaults on the `QueryClient` and
override per query, and justify each number. The issue list changes constantly — thirty
seconds. A repo's label set changes monthly — an hour. The authenticated user's own
profile — effectively for the session. Rate limit status — five seconds. Write the
argument down; the number without the argument is worthless.

Then make loading honest. `isPending` gets a skeleton that reserves the exact row height
so nothing jumps. `isFetching` gets a two-pixel progress bar at the top of the queue and
nothing else. Prove the difference: throttle the network, tab away for a minute, tab
back, and confirm the list stays on screen while the bar runs.

Add `placeholderData: keepPreviousData` to the filter switch, so changing from `bug` to
`enhancement` keeps the old list rendered and dims it rather than blanking. Then add hover
prefetching on each row so opening an issue is instant — with a `staleTime` on the
prefetch so a hover that goes nowhere is not immediately wasted.

**Where it gets hard:** distinguishing `initialData` from `placeholderData` when you first
need one of them. You will have the list response's summary of issue #482 in hand when the
user clicks into the detail view, and it is tempting to seed the detail query with it. Work
out whether that summary is *real and cacheable* or a *deliberate lie* — the list response
has fewer fields than the detail response — and pick accordingly. Getting this wrong caches
a truncated issue that other components then read as complete.

---

## Stage 5 — Writes, and how the cache finds out

**Forces into use:** Node 9

**What works at the end:** four working write actions — add/remove label, assign, comment,
close/reopen — with every affected view correcting itself afterwards.

Build them with `useMutation`, one at a time, and for each one answer explicitly: which
keys are now wrong? Closing an issue invalidates the list (it may leave the filter), the
detail, the header count, and the per-repo counts on the dashboard you have not built yet.
This is where the hierarchical key factory pays for itself: one prefix invalidation covers
all of them.

Then deliberately do one of them the other way. For the comment action, use `setQueryData`
to append the comment to the timeline instead of invalidating — and then look carefully at
what you got wrong. GitHub returns the comment with a rendered `body_html`, an `author
_association`, and reactions you did not construct. Screenshot the divergence, then decide
per action, on the merits, which of the four use `setQueryData` and which invalidate. Write
the decision down.

While you are here, hit the secondary rate limit at least once, on purpose, by firing
writes in a loop. GitHub's write limits are much stricter than its read limits, and the
response is instructive.

**Where it gets hard:** the same issue exists twice in your cache — once inside the list
array, once as a detail entry — and a write updates one of them. The list still shows the
old label. This is not a bug in your code; it is the document-cache property from Node 16
arriving early, and the correct response at this stage is a broader invalidation, not a
cleverer patch. Resist the urge to hand-sync the two copies.

---

## Stage 6 — Optimism

**Forces into use:** Node 10

**What works at the end:** labelling and assigning feel instantaneous, roll back visibly
and explicably on failure, and survive being clicked five times in a row.

Convert the label toggle to a full optimistic update: `cancelQueries`, snapshot with
`getQueryData`, `setQueryData` the optimistic value, restore from context in `onError`,
invalidate in `onSettled`. Then remove `cancelQueries` and use the chaos layer to make a
refetch land mid-mutation, so you see with your own eyes why it is there. Put it back.

Render optimistic state honestly: the pending label chip at reduced opacity, so a rollback
is not a magic trick. Pair the rollback with a toast naming the failure.

Then break it deliberately three ways and handle each: force a `_fail=500` on the write
and confirm the rollback; optimistically create a comment with a temporary ID and click it
before the server responds; and click the label toggle five times fast with a one-second
delay injected, which is the stacked-mutation problem — three snapshots each containing
the previous optimistic write.

Finally, decide which of your four actions should *not* be optimistic and say why in the
code. Closing someone else's issue is not a toggle.

**Where it gets hard:** the stacked-mutation case has no tidy answer and you should not
pretend otherwise. Your options are to serialise the mutations, to scope the rollback to
the single field rather than the whole entry, or to accept that `onSettled` invalidation is
the real backstop and the intermediate state can be briefly wrong. Pick one, write down why,
and know that this is a genuine trade-off rather than a thing you failed to solve.

---

## Stage 7 — Volume

**Forces into use:** Node 11

**What works at the end:** infinite scroll over a repo with tens of thousands of issues,
with no duplicates, no skips, and bounded memory.

Do offset pagination first, against a busy repo, and see it break. GitHub's REST issues
endpoint takes `page` and `per_page` and returns a `Link` header with `rel="next"`. Load
page one, then have someone (or you, in another tab) open a new issue, then load page two,
and find the duplicate. That is the shifting-window problem, observed rather than read
about.

Then switch the queue to GraphQL cursor pagination — `issues(first: 50, after: $cursor)`
with `pageInfo { hasNextPage endCursor }` — and `useInfiniteQuery`. Write
`getNextPageParam` to pull `endCursor` and return `undefined` at the end. Flatten with
`flatMap` for render. Drive it with an `IntersectionObserver` on a sentinel div, and guard
the handler with `hasNextPage && !isFetchingNextPage` before you discover why that guard
exists.

Then load forty pages and invalidate the query. Watch the network tab refetch all forty,
in sequence, because each cursor depends on the previous response. Time it. Then set
`maxPages` and decide what you actually want to happen when a write invalidates a deeply
scrolled list.

**Where it gets hard:** updating one issue inside an infinite query. The data is
`{ pages: [...] }` and a correct `setQueryData` maps over pages and then over each page's
nodes, returning new arrays at both levels. It is genuinely awkward, and working out
whether it is worth it versus just invalidating is the actual lesson.

---

## Stage 8 — Scheduling, and the shape of your requests

**Forces into use:** Node 12

**What works at the end:** a dashboard across five repos whose requests all start at the
same moment, with a before-and-after screenshot of the network waterfall.

Build the dashboard naively first — a `RepoCard` component per repo, each fetching its own
counts, nested inside a container that fetches the repo list. Screenshot the staircase.
Then fix it three ways and measure each: hoist the independent queries into one component,
use `useQueries` for the per-repo cards since the count is dynamic, and prefetch the issue
list for the repo the pointer is over.

Then build a genuinely dependent chain — the authenticated user, then that user's assigned
issues — with `enabled: !!user`. Immediately reproduce the eternal spinner by rendering the
spinner on `isPending` alone, then fix it by treating "waiting on a prerequisite" as its
own state. Then note in the README what would actually remove this waterfall: one BFF
endpoint that does both calls server-side, which you can build in ten lines because you own
the BFF.

**Where it gets hard:** measuring honestly. The waterfall view lies to you if requests are
served from cache, if the devtools panel is itself making requests, or if you are looking
at a warm run. Establish a repeatable measurement — hard reload, cache disabled, fixed
throttle — before you claim an improvement.

---

## Stage 9 — Move the first fetch to the server

**Forces into use:** Node 13

**What works at the end:** the queue's first paint contains issues, with no client request
on load, and everything from Stages 4–8 still working afterwards.

There is a forcing constraint here that is not pedagogical: **the GitHub token must never
reach the browser.** Up to now the BFF has been holding it, which is correct. Now go
further — render the initial queue in a server component, with a per-request `QueryClient`,
`await queryClient.prefetchQuery(...)` against your key factory, `dehydrate()`, and a
`<HydrationBoundary>` wrapping the client component.

Confirm three things: the HTML that arrives already contains issue titles (view source, not
the inspector); no request fires on first client render; and a subsequent filter change
still fetches client-side and still respects the `staleTime` you set in Stage 4 — which
means the dehydrated entry preserved its fetch time rather than restarting the clock.

Then write down, in the README, what specifically is still client-side and why: the filter,
every write, the infinite scroll, the polling you are about to add. This paragraph is the
answer to "doesn't RSC make React Query obsolete", and having built both halves you are
entitled to an opinion.

**Where it gets hard:** creating the `QueryClient` per request rather than at module scope.
It works fine in development with one user and fails catastrophically with two — one user's
prefetched data dehydrated into another user's HTML. You will not catch this by clicking
around alone, which is why Stage 11's second account matters.

---

## Stage 10 — Failure, and things that change while you watch

**Forces into use:** Nodes 14, 15

**What works at the end:** the console survives rate limiting and outages gracefully, and
new issues appear in the queue without a refresh.

Start with retries. Replace the default with a policy: retry 5xx and network errors, never
4xx, and treat GitHub's `403 X-RateLimit-Remaining: 0` as retryable but scheduled from the
`X-RateLimit-Reset` timestamp rather than from your own backoff. Honour `Retry-After` where
it appears. Use the chaos layer's `_failRate` to confirm a flaky endpoint recovers
invisibly, and confirm your mutations are *not* being retried.

Then error handling at the right altitude. Per-query error UI for one widget that can fail
alone; `throwOnError` plus an error boundary for the queue region, with
`QueryErrorResetBoundary` so the retry button genuinely resets rather than re-throwing the
cached error. Build a real rate-limit banner from the `X-RateLimit-*` headers — it is the
most useful piece of UI in the whole app and it costs nothing.

Then live data, in the causal order. First polling: `refetchInterval` on the queue, a
function that returns `false` when the tab is hidden or when the rate-limit budget is low.
Feel its cost — count the requests over ten minutes and multiply by an imagined hundred
users.

Then push. Add a webhook endpoint to the BFF, expose it with a tunnel, register it on one
of your repos, and stream events to the browser as SSE. Handle each event two ways and keep
both in the code behind a flag: invalidate the affected key, or `setQueryData` from the
payload with a version guard that refuses to write an older `updated_at` over a newer one.
Then have someone comment on an issue from github.com and watch it appear.

**Where it gets hard:** webhook delivery is genuinely fiddly — a public URL, signature
verification, and the fact that GitHub's payload for an `issues` event is shaped differently
from the REST issue you have cached. That reshaping is where a direct cache write quietly
becomes a lie, and noticing it is the point.

---

## Stage 11 — Two people, one cache

**Forces into use:** Nodes 16, 17

**What works at the end:** two signed-in accounts in two browser profiles, no cross-user
leakage, and a measurably calmer render profile.

Do the leak first, deliberately. Sign in as account A, browse, sign out, sign in as account
B — without reloading the page — and screenshot account A's assigned issues on account B's
dashboard. Then fix it twice over: `queryClient.clear()` on the logout path and on any 401
that ends the session, and the account login in every key that varies by user. Write the
reproduction into `FAILURES.md` alongside Stage 2's four.

Move the token properly while you are here: a short-lived session cookie, `HttpOnly` and
`SameSite`, issued by the BFF, with the GitHub token held server-side only. Then build the
401 refresh path and reproduce the stampede — five queries firing on load, all 401, all
refreshing — before implementing the single shared in-flight refresh promise.

Then performance, which the real-time work from Stage 10 has now made necessary. Profile
first: React DevTools with highlight-updates on, during an SSE burst. Fix what you find
with `select` for the header counts, returning a number rather than a filtered array, and
notice immediately why an inline `select` returning a fresh array changes nothing. Add
`notifyOnChangeProps` where a component genuinely does not care about fetch status.
Virtualise the queue once it holds a few thousand rows.

Finally, write the normalisation section of the README. You have two copies of issue #482
in your cache, you have watched them disagree, and you know what Apollo would do instead
and what that would cost. Three paragraphs, on the merits.

**Where it gets hard:** the refresh stampede is invisible until you build it and then
obvious forever. It also cannot be reproduced with one query on the page, which is why it
belongs here, after the dashboard exists.

---

## Stage 12 — Survive the tab closing, and prove all of it

**Forces into use:** Nodes 18, 19

**What works at the end:** a reload shows the queue instantly, a comment written offline
sends itself when you reconnect, and a test suite that fails when any of the previous
eleven stages regresses.

Persist the cache to IndexedDB with a persister. Then get the three obligations right, each
by breaking it first: persist without clearing on logout and find account A's issues on
disk after a browser restart; persist without a build-tied buster, change a data shape, and
watch old objects hydrate into new code; persist without `maxAge` and open the app a week
later. Fix all three.

Then offline writes. Set `networkMode`, go offline in DevTools, write a comment, come back
online, and watch it send. Then think about what you have not solved — ordering, and what
happens when the queued comment is rejected because the issue was locked while you were
away — and write down honestly what a real offline system would need.

Then the test suite, with MSW, because everything above is now regression surface:

- the list renders, and the request MSW received had the filter in the query string
- a 500 retries and recovers; a 404 does not retry
- the **race**: two subjects, first request delayed, assert the second subject's data wins
- the **optimistic rollback**: delayed failing write, assert the intermediate UI, then the
  rollback and the toast
- the **logout leak**: sign in as A, sign out, sign in as B, assert nothing of A's remains
- `keepPreviousData` across a filter change: assert the old list is still in the document

Each test gets a fresh `QueryClient` and `retry: false`. Use `findBy*` throughout, never a
sleep. Then delete the chaos layer's UI panel from the production build, and leave the code.

**Where it gets hard:** the race-condition test is the one worth the effort and the one
most likely to be flaky if written carelessly. It has to control response timing precisely
rather than hope, which means MSW handlers with explicit deferred resolution, not
`setTimeout` guesses.

---

## Coverage table

| Landscape node | Stage(s) | How it's forced |
|---|---|---|
| 0 — before client fetching | 1 | The first build is genuinely navigation-only; the filter is a link and you lose your scroll position every time |
| 1 — XMLHttpRequest / Ajax | 1 | **Partial.** Not written in XHR; covered as history in the landscape and the README's opening. Writing the list once in raw XHR is a 20-minute optional addendum if you want it in the hands |
| 2 — fetch and promises | 1, 2 | `res.ok` against GitHub's four different error shapes, error-body parsing, `AbortSignal.timeout`, `AbortController` in Stage 2 |
| 3 — useState + useEffect | 1 | Written by hand, twice, before any library is allowed |
| 4 — the four failures | 2 | Dedicated disaster stage; each failure reproduced and recorded before it may be fixed |
| 5 — server state is not client state | 3 | The authority is github.com and it changes under you; the stage's deliverable includes writing the argument in your own words |
| 6 — query cache and keys | 3 | Key factory built before the second query; dedup and structural sharing verified in devtools |
| 7 — staleness and refetching | 4 | `CACHING.md` with a defended `staleTime` per key |
| 8 — honest loading states | 4 | Skeleton on `isPending`, progress bar on `isFetching`, `keepPreviousData` on filter change, hover prefetch |
| 9 — mutations and invalidation | 5 | Four real write actions; one deliberately done with `setQueryData` to observe the divergence |
| 10 — optimistic updates | 6 | Full four-step shape, then `cancelQueries` removed on purpose, then three failure modes |
| 11 — pagination and infinite lists | 7 | Offset first until the duplicate appears, then GraphQL cursors and `useInfiniteQuery` |
| 12 — waterfalls | 8 | Naive nested dashboard measured, then fixed three ways and re-measured |
| 13 — the server boundary | 9 | Token-must-not-reach-browser makes it a requirement; prefetch/dehydrate/hydrate with the fetch time preserved |
| 14 — retries and error boundaries | 10 | Real GitHub rate limits plus the chaos layer; `X-RateLimit-Reset`-aware retry policy |
| 15 — real time | 10 | Polling first, then real webhooks over SSE, with both invalidate and guarded direct-write paths kept |
| 16 — performance and normalisation | 5, 11 | The two copies of issue #482 appear at Stage 5 and are analysed at Stage 11; `select`, `notifyOnChangeProps`, virtualisation profiled under an SSE burst |
| 17 — auth and cache safety | 11 | Two real accounts, leak reproduced before fixing, HttpOnly session cookie, refresh stampede |
| 18 — persistence and offline | 12 | All three persistence obligations broken deliberately, then fixed; a comment written offline |
| 19 — testing and devtools | 2, 12 | Devtools open throughout; MSW suite including race and rollback tests |

Node 1 is the only partial. Everything else is exercised in code, and eleven of the twenty
are exercised by a failure you cause on purpose.

---

## What this proves in an interview

- "I've reproduced the out-of-order race deliberately — I have it on video. Slow first
  request, fast second, and the first user's data lands last and wins. It's silent, and it
  doesn't reproduce on localhost, which is why I now throttle when I test anything that
  refetches on a parameter."
- "I treat server data as a cache, not as state. In `triage` the authority is GitHub — I
  can change a label in another tab and watch my cache be wrong — so the questions I ask
  are what's the key, how stale can it be, and how does it find out it's wrong."
- "I set `staleTime` per query with an argument written down. The issue list is thirty
  seconds because that's how fast a busy repo moves; the label set is an hour. `gcTime` I
  mostly leave alone — it's a memory setting, not a freshness one."
- "I invalidate by default and only write the cache directly where I can reconstruct
  exactly what the server would say. I tried it the other way for comments and GitHub
  returns a rendered `body_html` and an author association I wasn't constructing, so the
  cached comment was subtly wrong until a reload."
- "I shipped the logout leak on purpose once, in dev, to see it: sign out, sign in as
  someone else, and the SPA never reloaded so the previous account's assigned issues were
  still on screen. `queryClient.clear()` on logout, and the account in every key that varies
  by user."
- "My retry policy is status-aware. GitHub returns 403 with `X-RateLimit-Remaining: 0`
  rather than 429, so I schedule that retry from `X-RateLimit-Reset` instead of my own
  backoff, and I never retry mutations — if I needed to, that's an idempotency key on the
  server, not a client setting."
- "I killed a three-level waterfall on the dashboard by hoisting the independent queries
  and using `useQueries` for the dynamic ones. I measured it — hard reload, cache disabled,
  fixed throttle — because the waterfall view will happily tell you a warm run got faster."
- "The initial queue renders on the server and hydrates into the client cache, so the first
  paint has content and there's no duplicate request. But the filter, the writes, the
  infinite scroll and the SSE stream are all client-side against the same cache — server
  components moved the first read, they didn't remove the cache."
- "I know why my cache has two copies of the same issue. It's a document cache, that's the
  trade-off it makes, and I chose broader invalidation over hand-syncing them. A normalised
  cache like Apollo's wouldn't have that problem and would cost me merge configuration
  instead."

---

## Repo

**Name:** `triage`
**Visibility:** public

**README should lead with:** a fifteen-second GIF of the queue with the devtools panel
open — a label toggled optimistically, the chip dimmed, the request going out, the entry
going stale and refetching — and immediately under it, the "server state is not client
state" paragraph from Stage 3. That GIF makes the entire project legible to a reviewer
before they read a word, and the paragraph tells them you know why it works.

Also link `FAILURES.md` from the README, prominently. A repo that documents five bugs it
caused on purpose and then fixed reads very differently from one that claims none.

```bash
cd ~
mkdir triage && cd triage
git init
# scaffold as Stage 1 describes
git add .
git commit -m "chore: initial scaffold"
gh repo create triage --public --source=. --remote=origin --push
```

---

## If the domain doesn't appeal

The stage structure is the curriculum; GitHub issues are just the material. It transfers
to any app over a live, externally-owned, write-capable API with more than one identity —
a Linear or Jira console, a Spotify library manager, a Discord moderation queue, a
Shopify order desk. What it does **not** transfer to is anything backed by a stable API you
control alone, because then Node 5 is a claim rather than an experience, and the whole
chain loses its spine.

Say so before Stage 1 rather than three stages in.
