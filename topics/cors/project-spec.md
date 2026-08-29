# Pageframe — the CORS mastery project

## What you're building

**Pageframe** is a hosted feedback-and-comments widget, of the kind that Disqus,
Hyvor Talk, Cusdis and Giscus all are: a small JavaScript snippet that a site owner
drops into their own page, which renders a comment box, and which posts to your API.
People sign up on your dashboard, register the domains they own, get a snippet, and
paste it into their site. Their visitors then leave comments on their pages, and the
site owner reads and moderates those comments from your dashboard.

That description contains, without any contrivance, the exact situation CORS was
invented for — and it contains it *twice, in opposite directions*, which is what makes
it the right project rather than a merely adequate one.

The **first** direction is the one every tutorial covers: your dashboard is a
single-page app on one origin, your API is on another, the dashboard's user is logged
in with a session, and every request it makes is cross-origin and credentialed. That
forces the wildcard ban, the preflight, `Allow-Credentials`, `SameSite`, and the
allowlist.

The **second** direction is the one that almost no toy project reaches, and it is
where real understanding lives: the widget is loaded and run **on origins you do not
own and cannot enumerate in advance** — a customer's blog on `someones-blog.com`, a
Shopify store, a Next.js site on a preview URL that changes every deploy. Your API
must accept cross-origin reads from those origins, but only from the ones that belong
to a paying customer who registered that domain, and it must do so *without*
credentials, because the widget's visitors are anonymous. So you end up building the
thing the landscape warns about at Node 9 — a server that reflects the incoming
`Origin` — and you have to build it correctly, with a database-backed allowlist, exact
matching, and `Vary: Origin`, because a CDN will sit in front of it.

Deliberately easy: the product logic. A comment is a row with an author name, a body,
a page URL, a site ID and a timestamp. There is no rich text, no threading beyond one
level, no notifications, no billing. Moderation is an `approved` boolean. The
dashboard is three screens. Everything that is not cross-origin behaviour is kept
boring on purpose, so that when something breaks, the thing that broke is the topic.

## Why this project for this topic

The obvious CORS project — "build an API and a React frontend on different ports and
fix the errors" — covers Nodes 4 through 7 and stops. It never produces a reason for
`Vary: Origin`, because there is one origin. It never produces a reason to reflect,
because you can hardcode. It never produces a reason to care about `Expose-Headers`,
about opaque responses, about canvas tainting, about `crossorigin` on a script tag, or
about the difference between same-site and cross-site — because there is only ever one
customer, one domain, and one cookie.

An embeddable widget forces all of it, because the widget is *by definition* a
cross-origin resource loaded by strangers:

- **A dynamic, database-backed allowlist** is unavoidable (Node 9). You cannot
  hardcode customer domains, so you must reflect — and the moment you reflect you must
  get the matching right, add `Vary: Origin`, and think about `Origin: null`.
- **Two different CORS policies on one API** (Nodes 4, 7, 12). The dashboard routes
  are credentialed and use a fixed allowlist; the widget routes are anonymous and use
  the customer allowlist. Getting one middleware to serve both, correctly, is the
  central engineering problem of the project.
- **The script tag is the product** (Node 15). Your snippet is `<script src>` from
  another origin, so `crossorigin`, `"Script error."`, and Subresource Integrity stop
  being trivia and become the thing you ship.
- **A CDN is justified** (Node 9), because a widget script served to thousands of
  sites obviously goes behind one — which is exactly what produces the missing-`Vary`
  bug for real rather than as a story.
- **CSRF becomes concrete** (Node 12). Your widget accepts an anonymous cross-origin
  POST from arbitrary sites *by design*. You will have to reason out loud about why
  that is fine here and catastrophic on the dashboard routes, which is the sharpest
  possible version of "CORS is not authorization".
- **Realtime is natural** (Node 16). Moderators want new comments to appear live, and
  the two obvious transports — SSE and WebSocket — sit on opposite sides of the CORS
  boundary. Building both, deliberately, is how Node 16 stops being vocabulary.

Nodes that would be easy to skip, and the mechanism that prevents it: **Node 3**
(pre-CORS history) is forced by Stage 2, where you build the JSONP version first and
feel it; **Node 10** (debugging) is forced by Stage 8, a deliberate-disaster stage;
**Node 14** (designing around CORS) is forced by Stage 9, where you build the
same-origin alternative and measure the difference rather than being told about it.

This is also the topic where the qbank gap gets narrower in a specific way. qbank is a
Fastify API you cannot currently explain under pressure. Pageframe's API is Fastify
too, deliberately — same framework, same plugin model, same `onRequest` hook — but
here you will have written every line of the CORS layer yourself and know why each
option is set. That is directly transferable to being asked "how is CORS handled in
your API?" about qbank.

## The stack

**API — Fastify + TypeScript.** Same framework as qbank, on purpose. `@fastify/cors`
is used at first and then partly replaced by hand-written hooks in Stage 5, so you
learn both what the plugin does and what it hides.

**Database — Postgres, via Drizzle.** Three tables: `sites` (id, owner, name),
`origins` (site_id, origin string — the allowlist), `comments`. Also matching qbank's
stack. If you would rather not run Postgres, SQLite via `better-sqlite3` is fine; the
data layer is not the subject.

**Dashboard — Vite + React + TypeScript**, run on its own port in dev and deployed to
its own origin, because a shared origin would remove the entire first half of the
project.

**Widget — plain TypeScript compiled to a single ES module and a single classic
script**, no framework. This matters: the widget must be small, must not assume a
build system on the host page, and must be loadable both ways so that Node 15's
module-versus-classic distinction is something you built rather than read.

**Reverse proxy — Caddy or nginx**, appearing in Stage 6 and again in Stage 9.

**A CDN or edge cache in front of the widget script and the public read endpoint** —
Cloudflare's free tier is enough, and its cache behaviour is observable, which is the
point.

**Deliberately absent:** auth libraries beyond a hand-rolled session cookie, any CORS
"just make it work" copy-paste, and any framework that hides the network layer. React
Query is allowed in the dashboard; it does not obscure anything relevant.

---

## Stage 1 — One origin, no CORS, nothing broken

**Forces into use:** Node 0, Node 1, Node 14 (as a baseline you will later lose)

**What works at the end:** a single Fastify server on `http://localhost:3000` that
serves both a static HTML page and a JSON API, with a working comment box that posts
and lists comments. No CORS configuration exists anywhere in the codebase.

Build the data model and the endpoints first: `POST /api/comments`, `GET
/api/comments?siteId=&pageUrl=`, and a hand-rolled session using a signed
`HttpOnly` cookie so that a "site owner" can log in and see their own comments. Then
serve a plain HTML page from the same Fastify server that contains a form and a list,
talking to those endpoints with `fetch`.

The point of this stage is to have felt the baseline. Everything works. Cookies flow
without thought. There is no preflight anywhere. Open the network tab and look at what
a request costs when there is no cross-origin machinery: one request, one round trip,
no `OPTIONS`, no `Origin` header on the GETs. Write down what you see, because Stage 2
takes it all away and Stage 9 gives it back.

Before moving on, do one small thing deliberately: change the fetch to `POST` with
`Content-Type: application/json` if it is not already, and confirm that same-origin
still produces exactly one request. This is the control case for the preflight you are
about to meet.

**Where it gets hard:** it does not, and that is the observation. The difficulty is
resisting the urge to configure CORS "in advance because you know you'll need it".
Do not. The whole method of this project is that each mechanism arrives because
something specific broke.

---

## Stage 2 — Split the dashboard onto its own origin, and meet the wall

**Forces into use:** Node 1, Node 2, Node 3, Node 4, Node 5, Node 6

**What works at the end:** a React dashboard on `http://localhost:5173` that lists and
moderates comments from the API on `http://localhost:3000`, with CORS configured
deliberately and every request understood.

Move the UI out into a Vite React app on its own port. Nothing else changes. Load it
and watch everything break, then work through the breakage in the order the landscape
predicts rather than by pasting a fix.

First, the read. `GET /api/comments` fails with no header present. Before you fix it,
prove Node 2 to yourself: check the server logs and confirm the request *arrived and
was handled*. Then check the network tab and confirm you can see the response body
there while your code cannot. Only then add `Access-Control-Allow-Origin` — by hand,
as a single `onSend` hook, not via the plugin yet — and watch it pass.

Second, the write. `POST` with a JSON body now produces two rows in the network tab.
Sit with that: it is the first preflight you have caused. Read the `OPTIONS` request's
`Access-Control-Request-Method` and `-Headers`. Deliberately return a 404 for it and
see what the console says; then return a 200 with no `Allow-Headers` and see the
different message; then get it right. Now go back and change the POST's content type
to `text/plain` and confirm the preflight vanishes — and then reason about what that
means for CSRF, because you will need that reasoning in Stage 7.

Third, and this is the part most people skip: **build the JSONP version**. Add a
`GET /api/comments.jsonp?callback=` endpoint that wraps the JSON in a function call,
and load it from the dashboard with a dynamically created `<script>` tag. Make it
work. Then write, in the repo's README or a `NOTES.md`, why you are deleting it: it
executes remote code in your page, it is GET-only, and it cannot report an error. This
is fifteen minutes of work and it converts Node 3 from a paragraph you read into a
thing you have done.

**Where it gets hard:** the temptation to install `@fastify/cors` and move on. You
will be slower doing it by hand, and that slowness is the entire value of the stage.
Also genuinely hard: the first time you see a preflight fail, the console message and
the network tab disagree about what is wrong — the network tab shows an `OPTIONS` with
a perfectly ordinary status, and the console names a header. Learning to trust the
console message here is a skill.

---

## Stage 3 — Sessions across origins

**Forces into use:** Node 7, Node 13

**What works at the end:** the dashboard authenticates against the API across origins,
with a session cookie, and you can articulate the four independent conditions that had
to hold.

Wire the login flow from the dashboard. It will fail, and it will fail in at least
three distinct ways in sequence, which is the value.

The cookie will not be set, because the fetch does not send `credentials: "include"`
and the browser therefore ignores `Set-Cookie`. Fix that, and the server will now be
rejected by the browser because it is answering with `*`. Fix that by naming the
origin, and the credentialed preflight will fail because `Allow-Credentials` is on the
real response but not the `OPTIONS`. Fix that, and it will work locally — and then
break the moment you deploy, because the cookie is `SameSite=Lax` and the deployed
frontend and API are on genuinely different sites.

Do not shortcut this by setting everything at once. Let each failure happen and name
it before fixing it. At the end, write down the four conditions in your own words. The
one that will not be obvious until you hit it is that `SameSite` is not CORS at all —
the request succeeds, the CORS check passes, and the response is a clean 401 with no
console error anywhere.

Then deliberately create the confusing case: deploy the API to a subdomain of the same
domain as the dashboard and observe that a `Lax` cookie now flows without
`SameSite=None`, while CORS is still required. Same-site and same-origin, felt rather
than defined.

**Where it gets hard:** `SameSite=None` requires `Secure`, which requires HTTPS, which
means you cannot fully test the cross-site cookie path over plain `http://localhost`
in current browsers. You will need local TLS (Caddy's automatic local certificates are
the least painful route) or a deployed environment. Budget real time for this; it is
the single most common place where people conclude CORS is broken when the problem is
cookies.

---

## Stage 4 — Ship the widget: an API that answers to strangers

**Forces into use:** Node 4, Node 5, Node 9, Node 12, Node 15

**What works at the end:** a `<script>` snippet that a stranger can paste into any HTML
page, which renders a comment box and successfully reads and writes comments against
your API.

This is where the project becomes itself. Build `widget.js` as a small script that
finds its own `<script>` tag, reads a `data-site-id` attribute, injects a shadow-DOM
comment box, and calls two endpoints: `GET /public/comments` and `POST
/public/comments`.

Serve it from your API's origin, and then load it from a *different* origin. Do this
properly: make a second static site — a plain `index.html` served on another port, and
later on a real domain — that pretends to be a customer. This second site is the
project's equivalent of a second clone; without it you cannot test the thing you are
building.

Now the CORS question that has no hardcoded answer. The widget must work on origins
you have never seen. Add the `origins` table, a dashboard screen where a site owner
registers the domains they own, and a request hook that: reads `Origin`, looks it up
in the database (cached in memory with a short TTL), and echoes it back only on a
match, with `Vary: Origin`. These routes are **anonymous** — no credentials, ever —
which is what makes reflection acceptable here.

Deliberately write the matching wrong first: use `endsWith`. Then register
`https://customer.com` and prove to yourself, from your fake-customer site running as
`https://evil-customer.com`, that you have just allowed an attacker. Fix it to exact
`Set` membership. Then handle `Origin: null` explicitly by rejecting it, and write a
comment in the code saying why.

**Where it gets hard:** two policies on one API. The dashboard routes are credentialed
with a fixed allowlist; the public routes are anonymous with a dynamic one. If you
apply one CORS layer globally you will either leak credentials to customer origins or
break the widget. Deciding how to scope the two policies — Fastify's plugin
encapsulation, or two registered instances, or your own hook that branches on the
route prefix — is the real engineering problem of this stage, and it is a genuinely
good interview story.

---

## Stage 5 — Replace the plugin with your own hook, and read what it did

**Forces into use:** Node 5, Node 6, Node 8, Node 11

**What works at the end:** the same behaviour, implemented by a hook you wrote, plus a
written comparison against what `@fastify/cors` does.

Install `@fastify/cors` now, configure it to reproduce your current behaviour, and
diff the responses against your hand-rolled version with `curl -i`. Find the things it
does that you forgot — most likely `Vary`, the exact preflight status, and header
casing. Then decide, per route group, which one you keep.

While you are in here, add the pieces the widget actually needs and discover why they
are invisible. The widget wants to paginate, so return `X-Total-Count`; watch the
frontend read `null` from it, then add `Access-Control-Expose-Headers`. The widget
wants to respect your rate limiter, so return `X-RateLimit-Remaining`; same lesson,
second time, and this time you will predict it.

Add `Access-Control-Max-Age` and measure it. Count the `OPTIONS` requests in the
network tab for a page with three widget calls, set the header, hard-reload, count
again. Then set it to a year and observe that Chrome caps it at two hours anyway.

Finally, add a custom header the widget sends — `X-Pageframe-Version` — and watch a
previously simple GET acquire a preflight. Decide, with the number in front of you,
whether that header is worth a round trip on every cold page load. This is the
performance conversation the landscape describes, made concrete.

**Where it gets hard:** the plugin's `origin` option accepts a function, a string, an
array, a regex, and a boolean, each with different semantics, and its behaviour on a
rejected origin is to throw rather than to omit the header. Reading its source to find
out exactly what it emits — rather than guessing — is the skill this stage is
teaching, and it is the same skill you will need for qbank.

---

## Stage 6 — Put a CDN in front of it and break it

**Forces into use:** Node 9, Node 11

**What works at the end:** the widget script and the public read endpoint served
through a CDN, with a documented reproduction of the `Vary: Origin` bug and its fix.

Put Cloudflare (or any cache you can observe) in front of the widget script and the
public read endpoint. Register two customer domains and load your fake-customer page
from each.

Now remove `Vary: Origin` from the public routes on purpose and reproduce the bug: hit
the endpoint from customer A, confirm the cache filled, then hit it from customer B
and watch it fail with A's origin in the header. Capture the response headers from
both. Put `Vary` back and watch it partition. Write it up in `NOTES.md` — this is the
single best bug in the project, because it is intermittent, environment-dependent, and
completely invisible in local development.

While the proxy is in place, cause the duplicate-header failure deliberately: add the
CORS headers at both the proxy and the application and read the browser's complaint.
Then decide which layer owns CORS in this project and write that decision down as an
ADR, because "which layer owns it" is a question you will be asked.

**Where it gets hard:** cache behaviour is slow to iterate on and easy to fool
yourself about — a browser cache, a CDN edge cache and a different edge PoP all look
the same from the outside. You will need `curl` against the edge with explicit
`Origin` headers and an eye on `cf-cache-status` (or the equivalent) to know what you
are actually testing. Learning to isolate which cache you are hitting is the real
skill here.

---

## Stage 7 — The security stage: prove what CORS does and does not do

**Forces into use:** Node 2, Node 9, Node 12, Node 13

**What works at the end:** a small `attacks/` directory in the repo containing working
proof-of-concept pages, each with a note on what it demonstrates and how the fix
works.

Build the attacks against your own app, on a branch, and fix each one.

**The reflection hole.** Temporarily make the *dashboard* routes reflect any origin
with credentials. From an attacker page on a third origin, `fetch` the dashboard's
`/api/comments` with `credentials: "include"` while logged in, and read another
customer's moderation queue. This is the vulnerability from Node 9, executed against
your own code. Then fix it and re-run the attack to confirm it fails.

**The CSRF that CORS never stopped.** From the same attacker page, auto-submit a form
POST to a dashboard state-changing endpoint — approve a comment, delete one — with no
JavaScript reading anything. Watch it succeed with your CORS configured correctly.
Then fix it three ways in sequence and confirm each: set the session cookie to
`SameSite=Lax` and see the form POST stop; add a CSRF token and see it stop even for
same-site; add a server-side `Origin` check on state-changing routes and see it stop
at the edge. Understand why you would ship all three.

**The one that is fine.** Your public widget POST accepts anonymous cross-origin
writes from arbitrary sites by design. Write down why that is not a vulnerability
here (no ambient credentials, no user identity, nothing to forge) and what *would*
make it one (rate limiting by origin only, or trusting the `Origin` header for
attribution). This is the reasoning that separates someone who has memorised "CORS is
not CSRF protection" from someone who understands it.

**The non-browser client.** Call your public endpoints with `curl` and no `Origin` at
all. Note that every CORS rule you wrote is irrelevant here, and that the actual
protection is the site-id lookup and the rate limiter.

**Where it gets hard:** writing an attack against your own app requires holding two
mental models at once — the defender's and the attacker's — and the first time the
attack *works*, it is uncomfortable in a useful way. Also technically fiddly: you need
a third origin, a logged-in session in the same browser profile, and enough discipline
to keep this on a branch that never merges to main.

---

## Stage 8 — Realtime moderation, on both sides of the boundary

**Forces into use:** Node 8, Node 15, Node 16

**What works at the end:** the dashboard shows new comments live, implemented twice —
once over SSE and once over WebSocket — with the CORS difference documented.

Moderators want new comments to appear without refreshing. Build it with SSE first:
`GET /api/stream` returning `text/event-stream`, consumed by `EventSource` in the
dashboard. It is cross-origin, so it needs CORS — and then you will discover that
`EventSource` cannot set an `Authorization` header, so you must authenticate it with
the session cookie and `withCredentials: true`, which drags the whole credentialed
path back in. Note that this is exactly the shape of an LLM streaming endpoint, which
is the qbank-adjacent version of this problem.

Then build the same feature over a WebSocket and observe that **no CORS applies at
all**. The handshake succeeds from any origin. Prove it: connect to your WebSocket
from the attacker page in `attacks/` and receive a logged-in moderator's live comment
feed. Then add the server-side `Origin` check that fixes it, and understand that you
just wrote, by hand, the thing the browser was doing for you on every HTTP route.

While you are here, close out Node 15 against the widget: add `crossorigin="anonymous"`
and an `integrity` hash to the published snippet, deliberately break the hash and see
the load fail, and throw an error inside the widget with and without `crossorigin` to
see `"Script error."` appear and disappear in the host page's `window.onerror`. If the
widget renders any avatar image, draw one into a canvas and hit the tainting error
too.

**Where it gets hard:** SSE behind a proxy needs buffering disabled or events arrive
in clumps, and that failure looks exactly like a broken implementation. The WebSocket
hijack demo is also the moment the project stops feeling academic — you will be
reading a real logged-in user's data from a page that had no right to it.

---

## Stage 9 — The alternative you rejected

**Forces into use:** Node 14, Node 10, Node 11

**What works at the end:** a second deployment of the same application, same-origin
behind one reverse proxy, plus a written comparison with numbers.

Deploy the whole thing again, this time with Caddy or nginx serving the dashboard's
static build at `/` and proxying `/api` to Fastify, on one hostname. Change the
dashboard to call relative URLs. Then delete every piece of CORS configuration that
the dashboard needed — the allowlist entry, `Allow-Credentials`, the `SameSite=None`
on the session cookie — and confirm it still works.

Measure the difference honestly: number of requests on a cold load, time to first
data, and the count of configuration lines you deleted. Then note what *survived* the
change — the entire widget CORS layer, because the widget is genuinely cross-origin
and always will be. That is the real lesson of Node 14: the split you chose costs
something, the split the product requires does not have an alternative.

Finish with the debugging retrospective. Go back through your git history and
`NOTES.md`, collect every CORS failure you hit, and write a `DEBUGGING.md` that maps
each console message to its cause and its fix, with the exact `curl` command that
would have found it fastest. That document is the artifact you will actually reread
before an interview.

**Where it gets hard:** deploying the same app twice, in two topologies, from one
codebase, without the config branching becoming a mess. Doing it cleanly — one
environment variable that switches the dashboard between absolute and relative API
URLs — is a small architecture problem worth solving properly.

---

## Coverage table

| Landscape node | Stage(s) | How it's forced |
|---|---|---|
| 0 — before the restriction | 1, 7 | Stage 1 builds the ambient-cookie world; Stage 7 exploits it against your own app |
| 1 — the same-origin policy | 1, 2, 3 | Ports in dev, subdomains in Stage 3's same-site experiment |
| 2 — send vs read | 2, 7 | Stage 2 proves the request arrived while the read was blocked; Stage 7's form-POST CSRF is the send-only attack |
| 3 — XHR and the workarounds | 2 | You build and then delete a working JSONP endpoint |
| 4 — CORS as granted permission | 2, 4 | Hand-written `Allow-Origin` before any plugin exists |
| 5 — simple requests | 2, 5 | JSON body causes the first preflight; `text/plain` removes it; a custom header re-adds it |
| 6 — the preflight | 2, 5 | Deliberately failing the `OPTIONS` four different ways; `Max-Age` measured |
| 7 — credentials | 3 | Three sequential failures on the login flow before it works |
| 8 — expose headers | 5, 8 | `X-Total-Count` and `X-RateLimit-Remaining` both read as `null` first |
| 9 — caching, Vary, reflection | 4, 6, 7 | DB-backed reflection is unavoidable; the CDN reproduces the `Vary` bug; `endsWith` is exploited |
| 10 — debugging | 2, 6, 9 | Every stage fails first on purpose; Stage 9 produces `DEBUGGING.md` |
| 11 — where it's configured | 5, 6, 9 | Hand-rolled hook vs plugin vs proxy, including the duplicate-header failure |
| 12 — what CORS is not | 4, 7 | The public widget POST is a deliberate, correct, anonymous cross-origin write |
| 13 — SameSite | 3, 7 | Deployment breaks the `Lax` cookie; Stage 7 fixes CSRF with it |
| 14 — designing around it | 1, 9 | Stage 1 is the baseline; Stage 9 rebuilds it same-origin and measures |
| 15 — CORS outside fetch | 4, 8 | The product *is* a cross-origin script tag; SRI, `"Script error."`, canvas tainting |
| 16 — CORP/COOP/COEP, sockets | 8 | WebSocket hijack demo and its origin-check fix; SSE built alongside |

**Partially covered:** COOP/COEP/cross-origin isolation and Private Network Access are
touched only as reading in Stage 8. Genuinely forcing them needs a different project —
something using `SharedArrayBuffer` (an in-browser video or SQLite tool) for the
isolation headers, and a local-device integration for PNA. Both are marked [AWARE] in
the landscape, so this is an honest stop rather than a gap. If you want them forced,
the smallest addition is a Stage 10 that adds an in-browser image-compression step to
the widget using a WASM codec, which requires cross-origin isolation to use threads.

---

## What this proves in an interview

- "I built an embeddable widget, so my API has two CORS policies on the same server —
  a fixed allowlist with credentials for the dashboard, and a database-backed
  reflected allowlist with no credentials for customer sites. Keeping those separate
  in Fastify's plugin encapsulation was the actual design problem."
- "I shipped the reflection bug on purpose first, with `endsWith`, and exploited it
  from `evil-customer.com` before fixing it to exact matching. That is why I check
  origins with set membership and never a substring."
- "I reproduced the missing-`Vary: Origin` bug behind a CDN — customer A's
  `Allow-Origin` served to customer B from cache. It is intermittent and invisible
  locally, which is why I now treat `Vary` as part of writing the header, not an
  optimisation."
- "I can show you a form POST from a third-party page that succeeds against a
  correctly-configured CORS API, because CSRF only needs the send. I fixed it with
  `SameSite`, a token, and a server-side `Origin` check, and I'll tell you why all
  three."
- "I connected to my own WebSocket from an attacker page and read a logged-in
  moderator's feed, because CORS does not apply to the handshake. The server has to
  check `Origin` itself."
- "I measured what CORS costs: three widget calls meant three preflights on a cold
  load, and `Access-Control-Max-Age` removed them — capped at two hours by Chrome
  regardless of what I sent."
- "I built the same app twice, cross-origin and same-origin behind one proxy, and
  deleted every dashboard CORS line in the second one. The widget's CORS survived,
  because that split is required by the product rather than chosen."
- "I wrote a JSONP endpoint, made it work, then deleted it — it executes remote code
  in your page and cannot report an error. That is why CORS exists."

---

## Repo

**Name:** `pageframe`
**Visibility:** public

**README should lead with:** a four-line code block showing the actual snippet a
customer pastes — `<script src="https://cdn.pageframe.dev/widget.js"
data-site-id="..." crossorigin="anonymous" integrity="sha384-..."></script>` — followed
by a GIF of a comment appearing live in a moderator's dashboard as it is typed on a
completely different site. A reviewer understands the whole product, and the fact that
it is inherently cross-origin, in under ten seconds.

```bash
cd ~
mkdir pageframe && cd pageframe
git init
# scaffold: apps/api (Fastify), apps/dashboard (Vite React), apps/widget, apps/demo-site
git add .
git commit -m "chore: initial scaffold"
gh repo create pageframe --public --source=. --remote=origin --push
```

---

**On the subject matter:** the stage structure is about cross-origin topology, not
about comments. If a comments widget does not appeal, the same nine stages transfer
unchanged to any embeddable: a page-view analytics beacon, a status-page badge, a
booking widget, a support chat bubble, or a "buy this" button. The only requirement is
that the product is a script that runs on origins you do not own. Say so before Stage
1 rather than three stages in.
