# recast — the TypeScript mastery project

## What you're building

**`recast`** is a file conversion utility that does the boring thing perfectly. You drag a file onto the page, pick what you want it to become, and get it back. No account, no email, no watermark, no size cap, no queue, and — for the great majority of conversions — **no upload at all**, because the work happens inside your browser and the file never touches a server.

The formats it handles are the ones people actually need, not an impressive-looking list. Images: HEIC (the iPhone format Windows refuses to open), JPEG, PNG, WebP, AVIF, SVG. Documents: PDF above all — to and from Word, to and from images, merged, split, reordered, rotated, compressed to a size you specify, unlocked when you have the password, and made searchable when it's a scan. That's it. Depth over breadth, because a converter that handles forty formats badly is the thing that already exists and that everyone hates.

The three features that come from taking the problem seriously, rather than from a feature list: **compress to a target size** — you type "under 2 MB" because that's what the passport portal demands, and it iterates until it gets there instead of offering you "low / medium / high"; **OCR on scans** — a photographed document becomes text you can select and search, which is the exact case where every free tool gives up; and **honest failure** — when something can't be done, it says what it tried, why it stopped, and what would work instead, rather than spinning forever or producing a corrupted file.

What's deliberately simple: there are no users, no accounts, no billing, and no social features. There is no dashboard. The application logic is a queue, a registry, and a lot of care. What's deliberately *not* simple is the boundary work — file identification, browser-versus-server routing, memory pressure, cancellation, and format-specific failure modes — because that's where every competitor breaks and where TypeScript earns its place.

## Why this project for this topic

The reason I pushed for this over everything else on the list is that **the product's core truth and the topic's core truth are the same sentence.** A file arrives claiming to be a PDF. The claim is in its name. The name is not checked by anything, was written by someone else, and is frequently wrong — a `.pdf` that's actually a JPEG, a `.jpg` that's a HEIC because a phone renamed it, a `.docx` that's a ZIP with the wrong contents. The only truth is in the bytes, and you learn it by reading them. That is Node 15 — *a type annotation on external data is a lie until something validates it* — expressed as the first thing your product does to every file it touches. You will never have to reach for an analogy when explaining this.

On the nodes that projects usually skip: **type-level programming (Node 10)** is unavoidable because the conversion registry is a graph and multi-step routes are real — HEIC to PDF goes through JPEG — so resolving whether a route exists between two formats, at compile time, is the natural design, and hand-maintaining a table of valid pairs is what you'd have to do instead. **Generics and variance (Nodes 6 and 8)** are unavoidable because a dozen converters with different input types, options, and outputs behind one dispatch function is precisely the situation where a loose interface collapses into `any`. **Modules and declaration files (Node 12)** are unavoidable because the format package genuinely ships to npm and genuinely has to work in a browser and in Node, which is the hardest version of that problem. And **the build story (Node 14)** is unavoidable because WebAssembly modules and web workers force you to actually understand what your bundler is doing.

Two things it closes for you specifically. `qbank` uses BullMQ and Redis and you can't currently explain why a queue was the right shape — here the queue exists for a reason you'll have felt, because a 200-page PDF sent to a server converter takes forty seconds and a request can't hold that. And the browser-versus-server capability decision is a genuine architecture call you'll make and defend, which is the sort of thing that separates a candidate who has built something from one who has followed a tutorial.

## The stack

**Language:** TypeScript 5.8+, `strict` on from the end of Stage 1.

**Client:** React with Vite. The UI is deliberately small — a drop zone, a format picker, a job list — because the interesting code is underneath it. Vite specifically for its WASM and worker handling, which is a real reason and not a preference.

**Conversion, in the browser:** `pdf-lib` for PDF structure work (merge, split, rotate, page extraction — pure JavaScript, no WASM). `@jsquash/*` for image codecs, which are the actual libraries compiled to WebAssembly — JPEG, PNG, WebP, AVIF. `libheif-js` for HEIC, because Apple's format is the single most common real-world conversion request and no browser decodes it natively. `tesseract.js` for OCR. Web Workers for all of it, so the tab never freezes.

**Server, for what the browser can't do:** Fastify with `fastify-type-provider-zod`. Office formats need LibreOffice in headless mode; heavy PDF compression needs Ghostscript. Both run in a container, invoked by a worker process.

**Queue:** BullMQ on Redis. Not decoration — server conversions take tens of seconds and must survive a dropped connection.

**Database:** Postgres with Drizzle, holding jobs, share links, and format-level success/failure statistics. Small schema, real derivation of types from it.

**Storage:** S3-compatible (MinIO locally), with a hard TTL — server-side files are deleted within the hour, and that deletion is a stated product promise, not a maybe.

**Published package:** `@devxkapoor/formats` — the format registry, magic-byte detection, and the conversion graph, extracted and published. Note that `recast` is taken on npm by an unrelated AST library, so the product keeps the name and the package gets a scoped one; that's a normal real-world constraint and worth knowing rather than being surprised by.

**Deliberately absent:** no auth, no payments, no user accounts. Every one of those adds work without adding a boundary you don't already have.

---

## Stage 1 — one conversion, in the browser, in JavaScript first

**Forces into use:** Node 0, Node 1, Node 2, Node 5, Node 13 (first contact)

**What works at the end:** a page where you drop a HEIC or PNG and get a JPEG back, written first in plain JavaScript, then migrated to strict TypeScript.

Write it untyped. One HTML page, one JavaScript file: a drop zone, a call into `libheif-js` or the canvas API, a download link. Get it genuinely working — the conversion, the download filename, the object URL cleanup — and while you do, make at least one mistake that only shows up when you run it. Pass a `File` where you meant an `ArrayBuffer`; misspell a property on the options object. Notice what it cost to find.

Then migrate the way a real team would. `tsc --init`, then `allowJs` and `checkJs` with `strict: false`, so TypeScript reports on your JavaScript without you renaming anything. Read every error before fixing any of them. Then rename to `.ts` file by file, annotating only where inference genuinely can't reach — and notice how little that turns out to be.

Then flip `strict` on in one go and count the damage by category. Binary file handling is an unusually good place to feel this, because the DOM's file APIs are full of things that are legitimately possibly-null — `FileReader.result`, a canvas 2D context, a `Blob` from a canvas — and the compiler is right about every one of them.

**Where it gets hard:** the binary type zoo. `File`, `Blob`, `ArrayBuffer`, `ArrayBufferView`, `Uint8Array`, and now `Uint8Array<ArrayBufferLike>` in newer TypeScript, all describe overlapping things and convert between each other in non-obvious ways, and the library types disagree about which they want. Getting this straight once, early, saves the rest of the project — and it's the first real evidence that TypeScript's difficulty usually lives at the boundaries between libraries, not inside your own code.

---

## Stage 2 — the file is lying to you

**Forces into use:** Node 15, Node 4, Node 9, Node 2

**What works at the end:** every file is identified by its actual bytes before anything touches it, and a JPEG named `invoice.pdf` is handled correctly rather than crashing a converter.

Take the working converter from Stage 1 and feed it a file you've renamed by hand — a JPEG called `photo.pdf`. Watch what happens. It will either throw something incomprehensible from deep inside a library or produce a corrupt output, and either way the failure is far from the cause. That's the whole motivation for this stage and it takes ten seconds to produce.

Now build **magic-byte detection**: read the first bytes of the file and match them against known signatures. `%PDF` for PDF. `\xFF\xD8\xFF` for JPEG. The eight-byte PNG signature. `ftypheic` at offset four for HEIC. `PK\x03\x04` for anything ZIP-based, which includes DOCX and XLSX and means the signature alone is *not* enough — you have to look inside the archive to distinguish them, which is a good early lesson in "detection is a process, not a lookup."

The types this produces are the shape of the whole project. A `DetectedFile` is a **discriminated union** on the detected kind, each member carrying what's actually knowable about that kind. The detection function returns a `Result` — a discriminated union of success and failure — rather than throwing, because "we don't recognise this" is an expected outcome and a normal part of the product, not an exception. The bytes come in as `unknown` shape and get narrowed by evidence. And there is a case you must handle explicitly and deliberately: the extension says one thing, the bytes say another. The right product behaviour is to trust the bytes and *tell the user*, which is a design decision you should write down and be able to defend.

**Where it gets hard:** signatures are not a clean lookup table. Some formats need an offset, some need a length check, some need you to open a container and inspect it, and some are genuinely ambiguous from bytes alone. Building a detector that's honest about confidence — "this is definitely a PDF" versus "this is a ZIP that is probably a DOCX" — is more design work than it appears, and that confidence level flows into the type.

---

## Stage 3 — many converters, one registry

**Forces into use:** Node 7, Node 8, Node 3, Node 6, Node 4

**What works at the end:** a dozen conversions run through a single dispatch function, and adding a new converter is one entry in one place.

You now have one conversion and you need twelve. The naive version is a `switch` that grows forever and a set of functions with incompatible signatures. Build the registry instead: a `const` object, declared `as const`, where each entry names its input format, output format, options, and where it can run — browser, server, or either.

Derive everything from it. The `Format` union comes from `keyof` the format table, not from a hand-written list — so adding a format to the table adds it to the type, and the UI's format picker iterates the same object the types came from. This is the single-source-of-truth principle from the landscape's Node 16, arriving early because the product needs it early.

Then type the converter itself: `Converter<From, To, Options>`, generic in all three, with a constrained relationship between them. This is where you'll meet variance for real, because a registry of heterogeneous converters behind one dispatch function is exactly the situation where parameter positions bite — the dispatcher accepts a general input and each converter accepts a specific one, and getting that relationship wrong either fails to compile or, worse, compiles and is unsound in the way Node 6 describes.

Options are the second subtlety. JPEG conversion takes a quality number; PDF splitting takes a page range; OCR takes a language. A single flat options type with everything optional means every converter reads fields that may not apply. Options keyed by conversion, derived from the registry, means the UI can render exactly the right controls for the selected conversion and the compiler enforces it.

**Where it gets hard:** the temptation to make the registry type do too much at once. Build it in two passes — get it working with a simpler type first, then tighten — because a fully generic registry designed up front is very hard to debug when the inference doesn't flow. Also: converters have genuinely different failure modes, and unifying those into one error union without flattening them into useless strings takes a real design decision.

---

## Stage 4 — routes, and the conversion graph at the type level

**Forces into use:** Node 10, Node 8, Node 4

**What works at the end:** HEIC to PDF works without anyone writing a HEIC-to-PDF converter, because the system finds the route through JPEG — and asking for a conversion with no possible route fails to compile.

A user drops a HEIC and wants a PDF. You don't have that converter and you shouldn't write it, because with a dozen formats you'd need dozens of direct converters. What you have is a graph: HEIC to JPEG exists, JPEG to PDF exists, so the route exists and the pipeline is a composition.

The runtime half is a small pathfinder over the registry's edges — breadth-first, shortest route, with a cost preference so a lossless path beats a lossy one. Straightforward.

The type-level half is the point of this stage. **Can `convert(file, "heic", "epub")` fail to compile when no route exists?** Yes — the edge list is `as const`, so it's available in type space, and a recursive conditional type with `infer` can walk it and produce either the route as a tuple of steps or `never`. Constrain the function's parameters against that and an impossible conversion is a compile error at the call site, with the route itself available as a type. This is `as const`, `keyof`, indexed access, conditional types, `infer`, recursion, and distribution over unions, all working together on a problem where they're the *simplest* correct answer rather than a flourish — which is rare, and is why this project is worth building.

Two disciplines to impose on yourself here, and both are Node 18 arriving early. Cap the recursion depth explicitly — an unbounded type-level search will hit TypeScript's instantiation limit and produce an error message nobody can read. And keep the type-level pathfinder and the runtime pathfinder in one file, next to each other, with a test asserting they agree; two implementations of one idea is exactly the drift you spend the rest of the project preventing.

**Where it gets hard:** genuinely the hardest type-level code in this project, and it will take longer than you expect. Debugging recursive conditional types is done by instantiating them by hand on small inputs and reading the intermediate results in the editor — there's no debugger for the type system, and learning that technique is one of the real skills this stage buys. Also, you must decide when the type-level version stops being worth it: if the graph grows to a size where compile time suffers, the honest answer is a runtime check with a good error, and being able to say why you'd make that call is worth as much as the code.

---

## Stage 5 — big files, without freezing the tab

**Forces into use:** Node 4, Node 9, Node 6, Node 15

**What works at the end:** a 200 MB PDF converts with a live progress bar, the UI stays responsive throughout, and cancelling actually stops the work.

Convert a large file with everything on the main thread and the tab locks solid — the spinner doesn't even spin. That's the failure users blame on your product, and it's the reason "it works on a small file" is not a finished feature.

Move conversion into **Web Workers**, which introduces a boundary you cannot type your way across by declaration: messages between a worker and the page are serialised, arrive as `unknown`, and are the same untrusted-data situation as an HTTP response. Type the protocol as a discriminated union of messages in each direction, validate on receipt, and you have a small, well-understood channel instead of a pile of `any`.

Then the job model. A job is `queued`, `running` with progress, `succeeded` with a result, `failed` with a reason, or `cancelled` — a discriminated union that drives the entire UI, with an exhaustiveness check so adding a sixth state hands you the list of places to update. Add a worker pool so three files convert at once but thirty don't exhaust memory, cancellation via `AbortSignal` threaded through, and — for large PDFs — page-at-a-time streaming rather than holding the whole document.

Memory is the honest constraint here and it's worth measuring rather than guessing: browsers will kill a tab that allocates too much, and a 200 MB PDF expanded to bitmaps is far more than 200 MB. Deciding the threshold at which a conversion is *refused* in the browser and handed to the server is the decision Stage 6 exists to serve, and you should arrive at it from a real measurement.

**Where it gets hard:** transferable objects. Passing a large buffer to a worker copies it unless you transfer ownership, and transferring means the sender can no longer read it — which TypeScript's types do not capture and will not warn you about. This is a concrete, memorable example of a runtime rule the type system cannot express, and it belongs in your notes for Stage 10.

---

## Stage 6 — the server fallback, and the capability decision

**Forces into use:** Node 15, Node 17, Node 5, Node 16, Node 11

**What works at the end:** Word to PDF works, upload happens only when the browser genuinely can't do the job, and the user is told which happened and why.

Some conversions can't run in a browser. Office formats need LibreOffice; heavy PDF compression needs Ghostscript. So the system needs a server — and the interesting part is not building it, it's **deciding when to use it**, because "your file never leaves your device" is the product's promise and every exception to it must be deliberate and visible.

Build the decision as data: each registry entry already declares where it can run, so the router asks the registry, checks the browser's actual capabilities and the file's size, and produces a decision object — `{ where: "browser" }` or `{ where: "server", reason: "..." }` — that the UI shows the user before anything uploads. That transparency is the product differentiator and it falls out of a type you already have.

Then the server: Fastify, multipart upload with hard limits, Zod schemas on every route so the request body is validated at runtime and typed from the same declaration, and the environment parsed through a schema at boot so a missing `REDIS_URL` kills the process immediately with a legible message. BullMQ holds the job; a separate worker process shells out to LibreOffice in a container; results go to object storage with a TTL and a scheduled deletion you can prove happened.

The Fastify request needs to carry a request id and a rate-limit bucket, which `FastifyRequest` doesn't have — so this is where you write `declare module "fastify"` for real. Do it wrong first, in a file nothing imports, so you recognise the silence when it happens on a job.

Error handling gets its own layer here: a class hierarchy for your own errors, a type predicate to recognise them, `unknown` in every catch because a thrown value can be anything, and one handler mapping known errors to status codes and everything else to a logged 500 that leaks nothing.

**Where it gets hard:** shelling out to LibreOffice is genuinely unpleasant — it's slow to start, it fails in ways that only appear in stderr, and it will occasionally hang. Building a timeout-and-kill that reports honestly ("the converter timed out at 60 seconds") rather than a generic failure is what separates this from the competitors you're reacting to. Budget real time; none of it is TypeScript's difficulty, and that's worth knowing in advance so it doesn't feel like the language defeating you.

---

## Stage 7 — the three features that make it a product

**Forces into use:** Node 15, Node 4, Node 8, Node 9

**What works at the end:** compress-to-target-size, OCR on scans, and honest failure reporting — the three things that make someone tell a friend about it.

**Compress to a target size.** The user types 2 MB because a portal demands it. There is no formula from quality setting to output size, so this is a search: convert at a guess, measure, adjust, repeat, with a bounded number of attempts and a floor below which the result is too degraded to hand over. The type work is modest; the product work is real, and it's the single most requested thing that no free tool does properly.

**OCR on scanned documents.** A photographed PDF is images with no text. Run `tesseract.js` in a worker, get text with per-word confidence, and rebuild the PDF with an invisible text layer so it becomes searchable and selectable while looking identical. The confidence numbers matter: below a threshold, the honest product tells the user the scan quality is poor and shows them what it read, rather than silently producing garbage — which is exactly the failure you described in every existing tool.

**Honest failure.** Every failure gets a typed reason — unsupported route, password protected, corrupt input, too large for the browser, converter timed out, out of memory — and every reason maps to a message that says what was tried and what would work instead. This is a discriminated union with an exhaustive renderer, so a new failure mode cannot be added without someone writing the message for it. That constraint is the product principle enforced by the compiler, and it's the best sentence you'll have about why types are a product concern and not a developer convenience.

**Where it gets hard:** OCR quality is not under your control and the temptation is to hide that. Resist it. The other trap is the compression search on very large files, where each iteration is expensive — you need a smart initial guess from the file's characteristics rather than a naive binary search from the middle, or a single request eats a minute of CPU.

---

## Stage 8 — extract the package and publish it

**Forces into use:** Node 12, Node 13, Node 14, Node 3

**What works at the end:** `@devxkapoor/formats` is on npm — magic-byte detection, the format registry, and the conversion graph — working in a browser bundle, in Node, in ESM and in CommonJS, with types that a stranger's tsconfig can actually resolve.

The detection and registry code is genuinely useful on its own and is used by both your client and your server, so extract it. The extraction is easy; the *publishing* is where the education is.

You'll build with `tsc` for real here, because only `tsc` emits declarations — `declaration`, `declarationMap` so consumers' go-to-definition lands in your source, project references with `composite` so the app rebuilds when the package changes. Then the `exports` map with conditions for `import`, `require`, `browser`, and `types`, and the discovery that the *order* of those conditions matters. Then `verbatimModuleSyntax`, which forces you to mark every type-only import — busywork that pays off immediately in Stage 9.

Then test it properly, which almost nobody does: install the published package into a scratch project with a *different* tsconfig than yours — different `moduleResolution`, different `module` — and see whether it works. If it only works inside your monorepo, you haven't published a package, you've exported a folder. This exercise is where Node 12 and Node 13 stop being configuration trivia and become something you have actually done.

**Where it gets hard:** dual ESM/CommonJS publishing is the most tedious problem in the Node ecosystem and it has no elegant answer. Expect the conditional exports map to take real time and at least one consumer configuration to break in a way that seems arbitrary until you can hold both module systems and TypeScript's description of both in your head at once. That's the hardest hour in this project and it's worth every minute, because "I've published a dual-format package with working types" is a claim very few candidates can make.

---

## Stage 9 — the discovery chain, built out

**Forces into use:** Node 10, Node 8, Node 7, Node 16, Node 5

**What works at the end:** the features a user starts wishing for after two minutes all exist, and the app is polished enough that nothing about it feels like a demo.

This stage is the difference between a project and a product, and it's the one you must not skip because it's the one your non-technical reader will actually judge.

Batch conversion, with per-file status and a "download all as ZIP." PDF page operations — merge, split at a page, extract a range, reorder, rotate — which need a page-range expression (`1-3,7,9-`) parsed and validated, and that parser is a nice contained piece of real work. A share link with a genuine expiry, which is the only feature that stores anything server-side and therefore must state clearly what's stored and for how long. Local history in IndexedDB, so a returning user sees what they converted, entirely on their device. Keyboard support, mobile layout that actually works, drag-and-drop from a folder, and paste-from-clipboard for screenshots.

Two things belong here that most projects skip and that a careful reviewer notices immediately: **accessibility** — real focus management, live-region announcements for job progress, a UI that works without a mouse — and **a fully working no-JavaScript-error path**, meaning nothing silently fails to a blank screen.

The type work in this stage is quieter but real: the UI is driven entirely by the registry, so the format picker, the options controls, and the validation rules are all derived from one source, and adding a format lights up the entire interface without a component being edited.

**Where it gets hard:** this stage has no single difficult problem and a hundred small ones, which is its own kind of hard — it's where projects get abandoned at 85%, because the remaining work is unglamorous. It's also exactly the work that produces the "wow, this is actually finished" reaction you described, so treat the polish as the deliverable rather than as tidying up.

---

## Stage 10 — the deliberate unsoundness stage

**Forces into use:** Node 9, Node 6, Node 11, Node 2, Node 12, Node 13

**What works at the end:** a branch with seven planted failures that type-check cleanly and fail at runtime, plus `UNSOUNDNESS.md` explaining each, its fix, and whether it's a bug or a deliberate trade.

Plant them on a scratch branch, one at a time, each compiling without complaint. An `any` from an untyped WASM binding that propagates through three functions and silently disables checking on the conversion path. An `as` assertion on a worker message that's wrong because you changed the protocol on one side only — genuinely easy to do and a great story. A `!` on a canvas 2D context that really is null when the canvas is too large for the browser to back. A bivariant method-parameter substitution that accepts a converter too narrow for the inputs it'll receive. A numeric enum for compression level receiving a number that isn't one of its members. A `paths` alias that type-checks perfectly and throws at runtime because the bundler wasn't told the same thing. And an out-of-range array index typed `T` that's actually `undefined` — then fix that one by turning on `noUncheckedIndexedAccess` and paying its price across the codebase, and decide honestly whether to keep it.

Add the one this project gives you for free: the **transferable buffer** from Stage 5, where the types say you still hold a `Uint8Array` and the runtime says its length is now zero. Nothing in the type system can express transfer of ownership, and being able to name a limitation of TypeScript from your own experience — rather than from an article — is a genuinely strong interview moment.

**Where it gets hard:** constructing the bivariance failure so it genuinely compiles takes a few attempts, and the `paths` one requires internalising that `tsc` and your bundler resolve modules by entirely separate mechanisms. Obvious in hindsight; confusing the first time.

---

## Stage 11 — the build, the speed, and running without a build

**Forces into use:** Node 14, Node 18, Node 19, Node 13

**What works at the end:** dev starts instantly with no type-checking, CI gates on `tsc --noEmit`, the cold check is measurably faster than it was, and the server worker runs on Node's native type stripping.

Prove the split first: introduce a real type error, start the dev server, watch it run. That's Node 14's central fact, demonstrated on your own code in thirty seconds, and it explains a whole category of "but it worked locally." Then wire the real arrangement — `tsx` or Vite for running, `tsc --noEmit` in CI and on pre-push, `tsc --build` only for the published package's declarations, source maps with `--enable-source-maps` so production stack traces point at your TypeScript.

Then make it fast. By now the type-level pathfinder from Stage 4 and the derived registry types have made the cold check noticeably slow — that's not a hypothetical, it's the predictable consequence of what you built. Measure with `--extendedDiagnostics`, and if one type dominates, find it with `--generateTrace`. Apply fixes in leverage order — `skipLibCheck`, `incremental`, project references, and explicit return type annotations on the package's exported functions — and record the number after each. **Having your own before-and-after figures is worth more in an interview than any general knowledge about compile speed**, and this project is unusually likely to produce a dramatic one, because a recursive conditional type is exactly the kind of thing that shows up in a trace.

Finally, take the server worker package and run it under Node's native type stripping with no build step, with `erasableSyntaxOnly` on. Find every enum, parameter property and namespace, remove them — the compression-level enum from Stage 10 becomes an `as const` object with a literal union, which is Node 11's argument landing with real force — and write down what you gave up.

**Where it gets hard:** the pre-push check will be annoying on exactly the day it would have saved you. And diagnosing compile slowness is unglamorous work where the answer is usually one unfortunate type rather than anything systemic — finding that one type is the skill.

---

## Coverage table

| Landscape node | Stage(s) | How it's forced |
|---|---|---|
| 0 — before TypeScript | 1 | Built untyped first, with a real bug found at runtime |
| 1 — annotations & inference | 1 | `checkJs` migration; annotating only where inference can't reach |
| 2 — structural typing & erasure | 2, 3, 10 | Detected-kind unions; the erasure lesson lands hard on transferable buffers |
| 3 — object types | 3, 8 | Converter and options shapes; the package's public surface |
| 4 — unions & narrowing | 2, 5, 7 | Detection results, job states, and failure reasons, each with an exhaustive renderer |
| 5 — strictness & null | 1, 6, 10 | DOM file APIs are legitimately full of nulls; `noUncheckedIndexedAccess` decided in 10 |
| 6 — functions & variance | 3, 5, 10 | Heterogeneous converters behind one dispatcher; a planted bivariance failure |
| 7 — arrays, tuples, `as const` | 3, 4, 9 | The registry is `as const`; routes are tuples of steps |
| 8 — generics | 3, 4, 7 | `Converter<From, To, Options>`; the route resolver; the OCR and compression pipelines |
| 9 — `any`/`unknown`/`never`/assertions | 2, 5, 10 | Worker messages and file bytes arrive as `unknown`; four of the planted failures |
| 10 — type-level programming | 4, 9 | Route existence resolved by a recursive conditional type; the UI derived from the registry |
| 11 — classes & enums | 6, 11 | Error class hierarchy; the compression enum removed under `erasableSyntaxOnly` |
| 12 — modules & `.d.ts` | 8 | A real npm publish that must work in browser and Node, ESM and CJS |
| 13 — `tsconfig.json` | 1, 8, 11 | Several configs that must agree; consumer-side resolution tested from outside |
| 14 — the build story | 5, 11 | WASM and workers force bundler understanding; type error runs happily under `tsx` |
| 15 — the runtime boundary | 2, 5, 6 | The file's extension is a lie; worker messages and HTTP bodies are untrusted |
| 16 — types across the system | 3, 6, 9 | One registry drives converters, the router, the API schemas, and the UI |
| 17 — declaration merging | 6 | `declare module "fastify"` for request id and rate-limit context |
| 18 — when types get slow | 4, 11 | The route resolver is a genuine compile-cost source, measured and capped |
| 19 — where it's going | 11 | The server worker runs on native type stripping with `erasableSyntaxOnly` |

Every node is covered. The thinnest is Node 11 — a converter pipeline genuinely doesn't need many classes, and forcing them in would be dishonest. If you want classes and decorators exercised hard, that's a NestJS-shaped project, and it isn't worth distorting this one.

---

## What this proves in an interview

- "The first thing my product does to every file is ignore its name and read its bytes, because the extension is an unvalidated claim — which is the same reason a type annotation on `res.json()` proves nothing."
- "Conversions are a graph, so asking for HEIC to PDF finds a route through JPEG. The route is resolved at runtime by a pathfinder and at compile time by a recursive conditional type, and there's a test asserting the two agree."
- "Adding a new format is one entry in one `as const` registry. The format union, the UI's picker, the options controls, and the API schemas are all derived from it — nothing else gets edited."
- "Job state is a discriminated union with an exhaustiveness check, so when I added a cancelled state the compiler handed me every place that needed updating."
- "Every failure has a typed reason and an exhaustive renderer, so a new failure mode can't ship without someone writing the user-facing message. That's a product guarantee enforced by the compiler."
- "Worker messages are `unknown` and validated on arrival — it's the same boundary as an HTTP request, and I type the protocol as a union in each direction rather than asserting."
- "I published a dual ESM/CommonJS package with a conditional exports map and tested it by installing it into a project with a different `moduleResolution` than mine."
- "I can name a limitation TypeScript can't express: transferring an `ArrayBuffer` to a worker leaves you holding a zero-length view, and the type still says it's full."
- "My route resolver dominated compile time. I found it with `--generateTrace`, capped its recursion depth, and cut the cold check by more than half — I have the numbers."
- "Files never leave the device unless the browser genuinely can't do the conversion, and the app tells you before it uploads. That decision comes from the same registry that types everything else."

---

## Repo

**Name:** `recast`
**Visibility:** public
**npm package:** `@devxkapoor/formats` — the product keeps the name `recast`; the unscoped npm name is taken by an unrelated library, which is an ordinary constraint rather than a problem.

**README should lead with:** a short screen recording of a HEIC being dropped in and a JPEG coming out — with the network tab visible and empty, proving nothing was uploaded. Under it, one code block showing `convert(file, "heic", "epub")` failing to compile with the message that no route exists. Those two together tell a non-technical reader "this works and it's private" and a technical reader "the type system is doing real work here," in about fifteen seconds.

I'll create the repo at the start of Stage 1, so the first commit is real code rather than an empty scaffold.

---

