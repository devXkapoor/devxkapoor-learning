# substrate — the operating systems mastery project

**Status:** spec complete, not started. Phase 4 output; Phase 6 (build) has not begun.

## What you're building

`substrate` is a single-box platform that runs other people's services. You point it at a
Git repo, it builds that repo into a container image, runs it under a memory and CPU
budget it cannot exceed, gives it a subdomain, routes public HTTPS traffic to it, restarts
it when it dies, deploys new versions without dropping a request, and — the part that
matters most here — tells you exactly why it is slow when it is slow.

It is a small Fly.io, or a Dokku you understand. Every hosting platform you have ever
deployed to is this, with more machines. The reason it is the right project for this topic
is that **a platform is the only kind of program whose entire job is the operating
system**. A web app can be written without ever knowing what a cgroup is. A thing that
runs other people's code cannot: the moment there are two tenants on one box, you are
personally responsible for every mechanism in the landscape, because the tenants are
adversaries by default and the kernel is the only thing standing between them.

**Deliberately easy:** one machine, not a cluster — no distributed consensus, no
scheduling across nodes, no service mesh. The control plane is a Fastify JSON API and a
CLI; there is no React dashboard until you want one, and it is not part of the
curriculum. The tenant applications are trivial on purpose — a hello-world HTTP server, a
deliberately leaky one, a deliberately slow one — because the tenants are test fixtures,
not the subject. You will not write a container runtime, a filesystem, or a scheduler.

**Genuinely non-trivial:** you are multiplexing one machine's processor, memory, disk and
network across mutually untrusting programs, keeping them isolated, keeping the box alive
when one of them misbehaves, and remaining able to answer "why is tenant three slow" with
evidence rather than a guess. That is the actual job description of a platform engineer,
and it is unusually legible to an interviewer.

**Tenant one is `qbank`.** Your own Fastify + Drizzle + Postgres + BullMQ + Redis service,
deployed onto your own platform, and then measured and diagnosed by tooling you wrote. You
currently cannot explain that repo under pressure. By Stage 9 you will be reading its
event loop delay, its cgroup throttle counters, its descriptor table and its RSS
breakdown, on a platform you built, which is a considerably stronger position than having
read the code.

## Why this project for this topic

The obvious alternative — "write a toy kernel" — is the exact failure this format exists
to prevent. It teaches how an operating system is constructed, which is a rabbit hole, and
it leaves untouched the entire applied surface you would actually be hired for. You
already have `faraday-os` for that appetite, and it is not what closes the gap.

The second obvious alternative — "build a web app and notice the OS underneath" — fails
the forcing test. You can finish a web app while never once opening `/proc`, never setting
a cgroup limit, never thinking about `fsync`, and never learning what a namespace is.

A platform cannot avoid any of it. Each of the following nodes would be skippable in
almost any other project, and here is the specific thing that prevents skipping:

- **cgroups (27), page cache and OOM (13)** — Stage 3 exists because tenant B's memory
  leak kills tenant A. There is no way to fix that except budgets, and no way to report it
  correctly without knowing that page cache counts against the limit.
- **Namespaces (26), permissions and capabilities (25)** — Stage 4 exists because tenant B
  can `kill` tenant A's processes and bind its port. You cannot ship a two-tenant platform
  without this and be honest about it.
- **epoll (19), the event loop (20), blocking I/O (18)** — Stage 6 has you writing the
  router yourself, so the C10K arithmetic is not a story, it is your own throughput graph.
- **fsync and the write-ahead log (23)** — Stage 8 exists because your deploy state file
  is corrupt after you pull the plug, which you will do on purpose.
- **Signals (30)** — Stage 2 exists because your first `substrate stop` drops in-flight
  requests, and the reason is PID 1 discarding a signal it has no handler for.
- **Dynamic linking and libc (34), linking and ELF (33)** — Stage 5 exists because a
  tenant's native addon built on your Mac will not load in the image.
- **`/proc` (38) and tracing (39)** — Stages 9 through 11 are the product feature that
  makes the platform worth using, so observability is not homework bolted on the end.
- **Boot and init (36, 37)** — Stage 12 exists because the box reboots and everything has
  to come back without you.

## The stack

Chosen to be your stack, so the systems knowledge lands on the tools you are interviewing
for rather than on a language you will not use again.

- **TypeScript on Node 20+** for the control plane. Same runtime as `qbank`, so every
  event loop and memory lesson transfers directly to code you already own.
- **Fastify** for the control API. You already use it and cannot currently explain it.
- **Postgres** for control-plane state, from Stage 8. Before that, deliberately a JSON
  file, so that Stage 8 is motivated by a corruption you caused rather than by convention.
- **A real Linux box** — the cheapest Hetzner or DigitalOcean VM, Debian stable, around
  five euros a month. **This cannot be done on macOS or on Docker Desktop**, because
  Docker Desktop is a Linux VM (Node 29) and the whole point is direct contact with a
  kernel you control. WSL2 works for most of it; a real VM is better and is what Stage 12
  provisions from scratch anyway.
- **containerd + runc** as the container runtime, driven from Node over its socket. **You
  are calling a runtime, not writing one.** Stage 4 has you run `runc` by hand once, from
  a bundle you assemble yourself, purely so the eleven steps of Node 28 are something you
  have executed rather than read.
- **systemd** as the supervisor of `substrate` itself, and as the thing Stage 1 compares
  your own supervisor against.
- **nftables** for the routing rules, **Caddy or acme.sh** for certificates — certificates
  are not the subject and should not eat a week.
- **`perf`, `bpftrace`/BCC, `strace`, `iostat`, `ss`** — installed on day one and used
  from Stage 9 onward. These are the instruments; get them early.

Tenant fixtures live in the repo as `fixtures/`: `hello` (trivial), `leaky` (grows a
module-level Map per request), `blocker` (a synchronous 400 ms loop on one route),
`hungry` (allocates until killed), `chatty` (writes 50 MB of logs a minute), and
`forker` (spawns children and never reaps them). Each one exists to be diagnosed later.

---

## Stage 1 — a supervisor, and the things a process actually is

**Forces into use:** Nodes 5, 14, 22, 30 (partly), 35, 37

**What works at the end:** `substrate run ./fixtures/hello` starts the app, keeps it alive
across crashes with backoff, streams its output to a log, and survives your SSH session
closing.

Start with the naive version and let it break. Run `node fixtures/hello/index.js` over
SSH, close the terminal, watch it die, and work out why — that is `SIGHUP`, the controlling
terminal, and the process group, and it is worth ten minutes of deliberate confusion.

Then write the supervisor. `child_process.spawn` with an explicit `stdio` array, not
`exec`: you want the descriptor table configured by you, and you want to be able to say
what each of the three entries is. Capture stdout and stderr through pipes and write them
to a file, then notice that if you stop reading them the child blocks — that is the
64 KB pipe buffer and it is your first encounter with backpressure being a kernel object
rather than a library feature.

Restart on exit, with exponential backoff, and **record the exit code and decode it**.
Have the supervisor print "killed by SIGKILL (137)" rather than "exited 137", derived
rather than looked up. Then run `fixtures/forker`, watch `ps` fill with zombies, and fix
it — which means understanding that a child's exit status is a resource somebody must
collect.

Finally, make `substrate` itself a systemd unit and compare notes: it does what you just
did, plus tracking by cgroup rather than by PID file, which is the thing that makes
`systemctl stop` reliable and your version not yet.

**Where it gets hard:** the difference between what you *think* your process tree is and
what it actually is. `npm start` becomes four processes; a shell in the middle swallows
signals; a double-forking daemon detaches and your supervisor loses it entirely. Read
`/proc/<pid>/status` for `PPid` on every one of them until the tree stops surprising you.

---

## Stage 2 — stopping without dropping requests

**Forces into use:** Nodes 30, 5, 31, 8

**What works at the end:** `substrate stop <app>` finishes in-flight requests and exits
cleanly, and you can prove it with a load generator running during the stop.

Your Stage 1 supervisor kills apps. Point `autocannon` or `oha` at the hello fixture, run
`substrate stop`, and count the failed requests. That number is the stage's motivation.

Implement the real lifecycle: send `SIGTERM`, wait, escalate to `SIGKILL` at a deadline
you choose and can defend. On the tenant side, add the handler — stop accepting, finish
what is open, close the server, exit — and then discover that when the tenant runs as PID 1
inside a container in Stage 4, the same code stops working, because the kernel refuses to
deliver a defaulted signal to PID 1. Note that now; it pays off later.

Add a health endpoint and a readiness concept, separate from liveness, because Stage 7
needs them and because the distinction is a routine interview question that people get
wrong.

Then the deliberate experiment: give a tenant a handler that ignores `SIGTERM` entirely
and confirm your deadline works. Then give it one that takes longer than the deadline, and
decide what your platform's contract is. Write the contract down in the README. That
sentence — "we send SIGTERM, we wait N seconds, then we SIGKILL, and here is why N is that
number" — is the same sentence Kubernetes documents as `terminationGracePeriodSeconds`.

**Where it gets hard:** proving the drain actually drained. You need a load generator, a
counter of in-flight requests, and a log line at the moment the last one completes. Until
you have measured it, you have a graceful shutdown that you believe in rather than one
that works — and the failure mode is rare enough to survive casual testing.

---

## Stage 3 — budgets, because one tenant can take the box down

**Forces into use:** Nodes 27, 13, 12, 11, 10, 7, 6, 9

**What works at the end:** `substrate run --memory 256M --cpu 0.5` enforces both, and
`substrate status` reports throttling and OOM kills correctly and distinguishes them.

Run `hungry` and `hello` together with no limits. Watch the kernel kill something — and
notice it may not be the one you wanted, because `oom_score` weighs footprint. That is the
motivation, and it is worth reading `dmesg -T | grep -i killed` to see the kernel's own
account of the decision.

Create a cgroup per app under `/sys/fs/cgroup`, write `memory.max`, `cpu.max`, `cpu.weight`
and `pids.max`, and move the child into it. This is a directory and some file writes;
there is no library and you do not want one. Then run `forker` and confirm `pids.max`
saves the box, which is a thirty-second demonstration of why that control exists.

Now build the reporting, which is where the learning is:

- Read `memory.current` and **`memory.stat`**, and expose the `anon` versus `file` split.
  Then run `chatty` with a 256 MB limit and watch it get OOM-killed with a flat heap,
  because its own log writes are page cache charged to its cgroup. If your status output
  cannot explain that, it is not finished.
- Read `cpu.stat` and expose `nr_throttled` and `throttled_usec`. Give `hello` a 0.2 CPU
  limit, load it, and show latency spiking while average utilisation looks fine.
- Read `/proc/<pid>/status` for `VmRSS` and both context-switch counters, and explain in
  the output why RSS is the number that matters and VSZ is not.

Then size a Node tenant properly: set `--max-old-space-size` below the cgroup limit so V8
fails first with a catchable error, and document the arithmetic in the README.

**Where it gets hard:** believing the numbers. RSS includes shared pages counted in full,
so summing across a process tree overcounts; `heapUsed` and RSS disagree by hundreds of
megabytes for reasons that are all legitimate. You will spend a day deciding which number
your platform reports and being able to defend it.

---

## Stage 4 — isolation, and running `runc` by hand once

**Forces into use:** Nodes 26, 25, 28, 21, 35, 3

**What works at the end:** two tenants that cannot see each other's processes, cannot read
each other's files, and can both bind port 3000.

The motivation is a demonstration you should actually perform: from `hello`, run `ps aux`
and see every other tenant; `kill` one; read its config file; then try to start a second
copy and fail on `EADDRINUSE`. Three separate failures, one cause.

**Do this stage in two halves.** First, by hand and once: assemble an OCI bundle — a root
filesystem directory and a `config.json` — and run it with `runc run`. Then walk the
eleven steps of Node 28 against what you just did, and confirm each one. Use
`lsns`, `nsenter -t <pid> -n ip addr`, and `readlink /proc/<pid>/ns/*` to see the
namespaces as objects. This half exists so that containers stop being magic, permanently.

Second, in code: drive containerd from `substrate` and stop hand-rolling. Set up the
network with a veth pair into a bridge, assign addresses, and write the nftables rules
that publish a port. Set the tenant's user to a non-root UID, drop all capabilities, add
back only what a specific tenant needs, and turn on the default seccomp profile.

Then break it deliberately: run a tenant as root with a bind mount and observe the file
ownership problem on the host; fix it properly with a user namespace rather than with
`chmod 777`, and write down why the shortcut was wrong.

**Where it gets hard:** networking. veth pairs, bridges, NAT rules and DNS inside a
namespace are individually simple and collectively a swamp, and the failure mode is silent
— packets simply do not arrive. `ip netns exec`, `tcpdump` on the bridge, and reading
`nft list ruleset` are the way through. Budget real time here and do not read a slow
network as a personal failure.

---

## Stage 5 — images, and why the binary from your laptop will not run

**Forces into use:** Nodes 24, 33, 34, 0, 28, 14

**What works at the end:** `substrate deploy <git-url>` clones, builds an image, and runs
it — with a layer cache that makes the second deploy of an unchanged dependency tree fast.

Until now you have been copying directories. Deploy a tenant with a native dependency —
`sharp`, `better-sqlite3`, or `bcrypt` — by copying `node_modules` from your machine, and
collect the two errors: `invalid ELF header` if your laptop is ARM, and a missing shared
object or a `GLIBC_2.34 not found` if it is not. Two failures, two different nodes, and
the same lesson.

Build images properly with BuildKit. Then earn each rule rather than copying it:

- Order instructions so dependency installation sits above the source copy, then change
  one source file and time both orderings. The number is the lesson.
- Put a secret in one layer and delete it in the next, then extract it from the image with
  `docker save` and `tar`. Then do it correctly with `--mount=type=secret`.
- Build the same tenant on `node:20-slim` and `node:20-alpine`, and measure: image size,
  install time, whether the native addon needed compiling, and startup time. Write the
  comparison in the README with your own numbers rather than a blog's.
- Run `ldd` on the tenant's `.node` files inside both images and explain the difference.

Explain the layer cache in terms of overlayfs, and demonstrate copy-up cost by having a
tenant rewrite a 500 MB file inside its container versus in a volume.

**Where it gets hard:** build caching that is correct rather than merely fast. Cache too
aggressively and you ship stale dependencies; cache too little and every deploy takes four
minutes. Getting the cache key right — and being able to say what invalidates it — is the
part that takes a second pass.

---

## Stage 6 — the router, written by you

**Forces into use:** Nodes 18, 19, 20, 22, 32, 15

**What works at the end:** one public port serving every tenant by subdomain, with
streaming bodies, keep-alive, and timeouts, holding thousands of idle connections.

This is the stage that makes Part IV real. Write the reverse proxy yourself in Node —
`net`/`http`, no `http-proxy` library — because the whole point is that you handle the
sockets.

Route by `Host` header. Stream request and response bodies with `pipeline()` rather than
buffering, then deliberately do it wrong: buffer a 1 GB upload and watch RSS climb until
the process dies. That is Node 19's backpressure with a body count.

Then measure, because the numbers are the lesson:

- Hold 10,000 idle connections open and record the proxy's RSS and CPU. Compare against
  the arithmetic in Node 18. Yours will be a few hundred bytes per connection; write down
  what thread-per-connection would have cost.
- Turn keep-alive off between the proxy and tenants, load it, then turn it on. The
  difference is the handshake cost from Node 32.
- Run out of file descriptors on purpose. Get `EMFILE`, find the count in
  `/proc/<pid>/fd`, and raise the limit only after you have proved it is not a leak.
- Attach `strace -c -f -p <pid>` under load and read the syscall histogram. An idle proxy
  is one blocked `epoll_wait`; a busy one is a burst of `read`, `write` and `futex`.

Add per-tenant timeouts — header, body, idle — and be able to say which class of attack
each one closes.

**Where it gets hard:** streaming correctly under failure. A client that disappears
mid-upload, a tenant that closes mid-response, a slow reader on a fast writer — each
produces a different error (`ECONNRESET`, `EPIPE`, unbounded buffering) and each needs
handling. Getting all three right is genuinely fiddly and is exactly the code people
outsource to a library without understanding.

---

## Stage 7 — deploys that do not drop requests

**Forces into use:** Nodes 30, 31, 32, 16, 8, 20

**What works at the end:** `substrate deploy` replaces a running version with zero failed
requests under continuous load, proven by a load generator.

Naive version first: stop the old, start the new. Measure the failures. Then build the
real thing — start the new instance, wait for its readiness probe, shift routing, drain
the old, stop it.

The interesting part is the race, and it is the same race that produces 502s on every
Kubernetes rolling update: routing removal and `SIGTERM` are concurrent, so an instance
that stops accepting the instant it is signalled refuses traffic still being sent to it.
Reproduce it, then fix it — remove from routing, wait a beat, then signal — and write the
ordering down as a rule.

Then a second approach, for the comparison: hand the listening socket to the new instance
with `SO_REUSEPORT`, or pass the descriptor over a Unix socket with `SCM_RIGHTS` the way
Node's `cluster` does. Implement one, and be able to describe the trade against the
drain-based approach.

Add rollback, which forces a real question: what is the unit of a deployment, and where is
that state kept such that a crash mid-deploy leaves something recoverable?

**Where it gets hard:** proving zero downtime. It requires load during the deploy, a
counter of non-2xx responses, and enough repetitions to catch a race that fires once in
fifty. The first version will look perfect and be wrong.

---

## Stage 8 — state that survives the plug being pulled

**Forces into use:** Nodes 21, 23, 24, 12, 17, 16

**What works at the end:** control-plane state in Postgres, with a documented and measured
durability position, and a demonstrated recovery from an abrupt power loss.

Your state is a JSON file. Attack it: write it continuously while you hard-reset the VM
from the provider console. You will get a truncated file, and possibly an empty one, and
`substrate` will not start. That is Node 24's `data=ordered` behaviour and it is not a bug.

Fix it in stages, because each stage teaches its own thing. First, atomic writes: temp
file, `fsync` the temp file, `rename`, `fsync` the directory. Pull the plug again and
confirm you now get either the old file or the new one. Then acknowledge the ceiling —
this scales to one writer and no queries — and move to Postgres.

Then measure what a commit costs. Insert ten thousand deploy records with
`synchronous_commit` on and off, and record both numbers. Explain the difference in terms
of one `fsync` per commit, and explain why the gap narrows with concurrency (group
commit). Decide your platform's setting and defend it — for a control plane, on.

Add an advisory lock so two concurrent deploys of the same app cannot interleave, then
remove it and reproduce the corruption to prove the lock was load-bearing. Note explicitly
that this works because both deployers talk to one Postgres, and that a lock in your
process would have protected nothing.

**Where it gets hard:** the honest answer to "is it durable now". Your provider's disk may
lie about flushes; your filesystem's mount options matter; and the difference between
"survives a process crash" and "survives a power cut" is one you have to test rather than
assume. Test it. Twice.

---

## Stage 9 — the diagnostics plane

**Forces into use:** Nodes 38, 27, 7, 20, 13, 11, 15, 6

**What works at the end:** `substrate top <app>` and a JSON metrics endpoint that answer
"why is this slow" with kernel evidence, not guesses.

This is the product feature that makes the platform worth using, and it is where every
`/proc` and cgroup file in the landscape earns its place. Per tenant, collect and expose:

- From the cgroup: `memory.current`, the `anon`/`file` split from `memory.stat`,
  `cpu.stat`'s `nr_throttled` and `throttled_usec`, `pids.current`, and the PSI values
  from `cpu.pressure` and `memory.pressure`.
- From `/proc/<pid>/`: state letter, thread count, `VmRSS`, both context-switch counters,
  descriptor count against the limit from `limits`, and minor versus major faults.
- From the tenant itself, over a small agent endpoint: event loop delay percentiles from
  `monitorEventLoopDelay`, event loop utilisation, and the five numbers from
  `process.memoryUsage()`.

Then write the interpretation layer, which is the actual skill. Given those inputs, emit
a verdict: throttled, not throttled; loop blocked, loop idle; leaking anonymous memory
versus accumulating page cache; descriptor leak; waiting on storage. **A number nobody can
act on is not a metric.**

Deploy `qbank` as a tenant here and read it. You will learn more about your own repo in an
afternoon of this than in a week of reading it, and it produces the sentences you need for
an interview.

**Where it gets hard:** attribution. Per-thread CPU means walking `/proc/<pid>/task/`;
correlating a spike in event loop delay with a GC pause means two clocks agreeing;
distinguishing "slow because throttled" from "slow because the code is slow" requires both
signals at once. Getting the verdict right, rather than just displaying the raw numbers,
is a genuinely hard piece of design.

---

## Stage 10 — the deliberate disaster

**Forces into use:** Nodes 13, 27, 19, 20, 5, 32, 12, 3, 30

**What works at the end:** a `disasters/` directory where each entry is a planted failure,
the symptom it produces, the command that identifies it, and the fix — every one
reproduced by you on your own box.

Failures do not arrive on schedule, so plant them. Each one gets a runbook entry, and the
set is directly interview material because every one of them is a real incident somebody
has had:

1. **OOMKilled with a flat heap** — `chatty` writing logs inside a tight memory limit.
   Found via the `anon`/`file` split. Fixed by logging to stdout.
2. **Latency spikes at 40% CPU** — `hello` under a 0.2 CPU limit. Found via
   `nr_throttled`. Fixed by raising or removing the limit, and you should be able to argue
   both.
3. **Blocked event loop** — `blocker`'s synchronous route. Found via event loop delay and
   a growing accept queue in `ss -lnt`. Fixed by chunking or a worker thread.
4. **Descriptor leak** — a tenant that never closes responses. `EMFILE`, found in
   `/proc/<pid>/fd`.
5. **Unkillable process** — mount something over a network filesystem, make it hang, and
   meet `D` state. Confirm with `/proc/<pid>/stack` that `kill -9` genuinely cannot work.
6. **Ephemeral port exhaustion** — a tenant making rapid outbound connections without
   keep-alive. `EADDRNOTAVAIL`, `TIME_WAIT` counts in `ss -s`, fixed by pooling.
7. **RSS climbing with a flat heap** — a leak in a native addon or in buffers. Prove a
   heap snapshot cannot see it.
8. **Zombie flood** — `forker`, and PID exhaustion.
9. **A segfault in a native addon** — exit 139, no JavaScript stack, and the explanation
   of why no handler could have caught it.
10. **`exec format error`** — deploy an image built for the wrong architecture.

**Where it gets hard:** reproducing on demand. Several of these are timing-dependent and
will not fire when you are watching. Making a race reproducible — with load, with a
tightened limit, with a slowed disk — is a skill in itself, and it is the same skill as
reproducing a production bug.

---

## Stage 11 — seeing inside without stopping anything

**Forces into use:** Nodes 39, 40, 0, 2, 4

**What works at the end:** a flame graph of a tenant under load with JavaScript frames
resolved, plus a small set of eBPF tools wired into the platform.

`strace` is too slow for production and you should prove it to yourself: measure a
tenant's throughput with and without it attached, then stop using it for performance work.

Then the three layers, in order, on the same slow tenant:

- **JavaScript:** `node --prof` and `--prof-process`, or the inspector. Answers "which of
  my functions".
- **Native:** `perf record` with `--perf-basic-prof` so V8's JIT frames resolve to names
  instead of hexadecimal. Fold into a flame graph. This is what shows GC, JSON
  serialisation, TLS and addon time — none of which the first layer can see.
- **Kernel:** `execsnoop` to see every process the platform starts, `runqlat` to see
  scheduler wait time (which is where throttling shows up as a distribution),
  `biolatency` for storage, `tcplife` for connections.

Wire two or three of these into `substrate` as an on-demand profile endpoint, so that
"profile tenant three for thirty seconds" is a platform feature. Then read a flame graph
correctly and write down what width means and what the left-to-right order means, because
it is asked and commonly answered wrong.

**Where it gets hard:** permissions and symbols. Profiling inside a container needs
`SYS_PTRACE` or privileged access, JIT frames vanish without the map file, and kernel
symbols need the right packages. Every one of these fails silently and looks like the tool
being broken.

---

## Stage 12 — the box itself, and the honest security review

**Forces into use:** Nodes 36, 37, 1, 29, 4, 25, 41, 43

**What works at the end:** a machine that goes from bare provider image to fully running
platform with one command, survives a reboot unattended, and deploys from CI on a push.

Destroy the VM. Rebuild it from nothing with `cloud-init`, and let the first boot install
`substrate`, its systemd unit, containerd and the firewall. Watch the boot with
`systemd-analyze blame` and `journalctl -b`, and read the ordering as the dependency graph
it is. Confirm every tenant comes back after `reboot` without you.

Then close the loop with CI: a push builds the image, pushes it to a registry, and calls
your deploy API. That pipeline is the resident monitor from Node 1, and it is worth
writing that sentence in the README.

Then the security review, written honestly in `SECURITY.md`. State plainly what your
isolation is worth: containers share one kernel, so a kernel privilege-escalation bug is a
tenant escape, and no amount of seccomp changes that. List what you did — non-root, all
capabilities dropped, `no_new_privs`, read-only root filesystem, seccomp on, user
namespaces — and what you did not, and say what you would use if the tenants were genuinely
hostile: Firecracker microVMs, Kata, or gVisor, and what each costs.

Finish with the document that is the real deliverable: `LIFECYCLE.md`, one request traced
from the packet arriving at the NIC to the response leaving, naming every mechanism it
passes through on your own machine. That is Node 43, written from your own system rather
than from this landscape, and it is the single most useful artifact in the repo.

**Where it gets hard:** making the rebuild genuinely unattended. There will be a step you
did by hand in Stage 4 and forgot. The only way to find it is to destroy the box and try
again, and you will do that three or four times.

---

## Coverage

| Landscape node | Stage(s) | How it's forced |
|---|---|---|
| 0 — the bare machine | 5, 11 | `exec format error` on the wrong architecture; JIT frames in `perf` |
| 1 — the resident monitor | 1, 12 | your supervisor loop; the CI pipeline as a batch monitor |
| 2 — the interrupt | 9, 11 | `/proc/interrupts` balance; `si` time under proxy load |
| 3 — privilege | 4, 10 | dropping capabilities; a native segfault with no catchable handler |
| 4 — the system call | 6, 11, 12 | `strace -c` on the proxy; the seccomp profile |
| 5 — the process | 1, 2, 9 | the process tree; zombies; `/proc/<pid>/status` |
| 6 — the context switch | 3, 9 | voluntary vs nonvoluntary counters as a throttling signal |
| 7 — the scheduler | 3, 9, 10 | `cpu.weight` vs `cpu.max`; `runqlat`; the throttling disaster |
| 8 — time | 2, 7, 8 | shutdown deadlines; monotonic clocks for latency; deploy timestamps |
| 9 — physical memory | 3 | why a budget must exist at all, and what fragmentation costs |
| 10 — virtual memory | 3, 9, 10 | RSS vs VSZ vs PSS in your own reporting; major faults |
| 11 — the address space | 9, 10 | the five `memoryUsage()` numbers; a buffer leak invisible to a snapshot |
| 12 — the allocator | 3, 10 | RSS not falling after free; `MALLOC_ARENA_MAX` on a fat tenant |
| 13 — page cache and OOM | 3, 10 | `chatty` OOMKilled with a flat heap |
| 14 — fork and copy-on-write | 1, 5 | `spawn` under the hood; overlayfs copy-up cost measured |
| 15 — threads | 6, 9 | per-thread CPU in `/proc/<pid>/task/`; threadpool saturation |
| 16 — races | 7, 8 | the deploy/routing race; two concurrent deploys corrupting state |
| 17 — locks | 8 | a Postgres advisory lock, removed to prove it was load-bearing |
| 18 — blocking I/O and C10K | 6 | 10,000 idle connections measured against the arithmetic |
| 19 — epoll | 6, 10 | `EMFILE`; backpressure; `epoll_wait` in `strace` |
| 20 — the event loop | 6, 9, 10 | the proxy itself; loop delay as a platform metric; `blocker` |
| 21 — files and inodes | 4, 8 | bind mounts and mount shadowing; atomic rename |
| 22 — descriptors and pipes | 1, 6, 10 | the `stdio` array; pipe buffer blocking; descriptor leak |
| 23 — storage and fsync | 8 | pulling the plug; measuring `synchronous_commit` |
| 24 — filesystems and overlayfs | 5, 8 | layer caching and secret extraction; a truncated file after a crash |
| 25 — permissions and capabilities | 4, 12 | non-root tenants; volume ownership; the security review |
| 26 — namespaces | 4 | the three-failure demo, then `runc` by hand, then containerd |
| 27 — cgroups | 3, 9 | writing the limit files; reading the stat files |
| 28 — the container assembled | 4, 5 | running `runc` from a bundle you built |
| 29 — virtual machines | 12 | provisioning the box; the microVM alternative in the review |
| 30 — signals | 2, 7, 10 | the drain; PID 1 discarding a defaulted signal |
| 31 — IPC | 1, 7, 9 | the agent channel; `SCM_RIGHTS` descriptor passing |
| 32 — the network stack | 6, 7, 10 | the proxy; accept queue overflow; `TIME_WAIT` exhaustion |
| 33 — compiling and linking | 5 | a native addon's `.node` file and `invalid ELF header` |
| 34 — dynamic linking and libc | 5, 10 | alpine vs slim measured; `GLIBC_2.34 not found` |
| 35 — execve | 1, 4 | the process tree; `exec` in an entrypoint |
| 36 — boot | 12 | rebuilding the machine from nothing with `cloud-init` |
| 37 — init and systemd | 1, 12 | your supervisor vs systemd; unit files with cgroup limits |
| 38 — `/proc` | 9 | the entire diagnostics plane is built from it |
| 39 — tracing | 11 | flame graphs with resolved JIT frames; eBPF tools |
| 40 — the boundary | 11 | syscall counts measured; `io_uring` considered for the proxy |
| 41 — kernel architectures | 12 | the security review's monolithic-kernel argument |
| 42 — history | **not covered by building** | it is reading, not doing. Covered by the landscape and the recall deck; a `DESIGN.md` noting which decisions descend from 1969 is the closest a project gets |
| 43 — the whole lifecycle | 12 | `LIFECYCLE.md`, traced through your own machine |
| 44 — the six forces | 12 | the README's design-decisions section, naming which force each choice answers |

Forty-two of forty-five forced by construction. Node 42 is honestly uncovered; Nodes 43
and 44 are covered by writing rather than by code, which is the correct treatment for a
synthesis node.

---

## What this proves in an interview

Sentences you will be able to say, grounded in something you did:

- "I run a small platform on one box. A tenant kept getting OOMKilled with a completely
  flat heap graph — it turned out its own log writes were page cache charged to the
  cgroup, and I found it in the anon-versus-file split in `memory.stat`."
- "I had a service with p99 spikes at forty percent average CPU. It was CFS throttling —
  it burned its hundred-millisecond quota in thirty and slept for seventy. I found it in
  `nr_throttled`. Now I set requests and think hard before setting limits."
- "I wrote the reverse proxy myself rather than using a library, so I have held ten
  thousand idle connections and measured what they cost — a few hundred bytes each,
  because it is one thread on epoll rather than a thread per connection."
- "We were getting a burst of 502s on every deploy. Endpoint removal and SIGTERM happen
  concurrently, so the instance was refusing traffic still being routed to it. I fail
  readiness first, wait out the propagation, and only then stop accepting."
- "I pulled the power on the box while writing state. I learned the difference between
  atomic — temp file plus rename — and durable, which needs fsync on the file and on the
  directory. Then I measured what `synchronous_commit` actually costs."
- "I ran `runc` by hand from a bundle I assembled, so I can tell you what `docker run`
  does: it is namespaces, a cgroup, an overlay mount, a `pivot_root`, dropping
  capabilities, a seccomp filter, and then `execve`."
- "I can profile a Node process at three layers, and I know which one to reach for.
  If no JavaScript function accounts for the CPU, the answer is in `perf` — GC, JSON, TLS
  or a native addon — and the JavaScript profiler will never show it to you."
- "My security document says plainly that container isolation is worth exactly as much as
  the kernel's correctness, because there is one kernel. If I had genuinely hostile
  tenants I would use Firecracker, and I can tell you what that costs."

---

## Repo

**Name:** `substrate`
**Visibility:** public

**README should lead with:** a single terminal recording — `substrate deploy` on one side,
a load generator showing zero failed requests on the other, and `substrate top` underneath
showing the new instance taking traffic while the old one drains. Thirty seconds, and a
reviewer understands the whole project.

Second item in the README: the `substrate top` output for a throttled tenant, with the
verdict line. That one screenshot is the difference between "built a deploy script" and
"understands the machine".

```bash
mkdir -p ~/substrate && cd ~/substrate
git init
gh repo create substrate --public --source=. --remote=origin --push
```

---

## Before Stage 1

If a hosting platform is not a domain you want to spend months in, the stage structure
transfers almost unchanged to two other applications, and it is much better to swap now
than three stages in:

- **A CI runner** — you accept jobs, run untrusted code in isolation with budgets, stream
  logs, enforce timeouts, and cache aggressively. Nearly the same node coverage; Stage 6's
  proxy becomes a log-streaming service, and Stage 7's zero-downtime deploy becomes job
  draining on shutdown.
- **A sandboxed code-execution API** — the thing behind every online judge and every
  LLM code-interpreter tool. Stronger on isolation, seccomp and resource limits, weaker on
  routing and deploys, and unusually relevant to applied-AI roles.

The hosting platform is the recommendation, because it covers the most nodes, it is the
most legible on a CV for backend and DevOps roles, and it is the one where `qbank` becomes
tenant one.
