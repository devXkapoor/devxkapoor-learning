# devxkapoor-learning — session handoff

Read this first. It is the state of the mastery track as of **2026-08-27**, written so a
fresh session can continue without the previous conversation.

The workflow is the `topic-mastery` skill (**v2**, at `~/.claude/skills/topic-mastery/`).
Invoking `/topic-mastery <topic>` prints a run plan whose first line reads
`topic-mastery v2 · <slug>` — if that banner is missing, an old copy is loaded.

## Standing preferences (learned the hard way — do not relearn these)

- **Claude runs all git commands.** Never hand over commands to run. Do the
  `add`/`commit`/`push`, say in one line that it is pushed, and continue.
- **After editing anything in `assets/`, run `python3 bump-assets.py` before
  committing.** GitHub Pages caches assets for 10 minutes; without the content-hash
  stamp a shipped fix looks like it never happened. This has already cost a full
  debugging round.
- **Every response that offers choices ends with model routing per choice.** See
  `references/model-routing.md`. This is the most frequently broken instruction.
- **Never do a broad range-replacement in `assets/globals.js` or `styles.css`.** Two
  incidents: one deleted 965 lines, another silently deleted three CSS rules
  (`.nt-add`, `.nt-list`, `.nt-item`) and left the follow-up button rendering as an
  unstyled browser default for several rounds. Replace bounded functions or exact
  strings only, then verify nothing else vanished.
- He uses **voice dictation** for follow-ups, and **Edge Read Aloud** to consume prose.
- He pushes back when questions get managed rather than answered. Answer first.

## Where each topic stands

| Topic | State |
|---|---|
| **javascript** | Landscape (19 nodes), recall (184), prep (62), **all 18 elaborations done**, project spec written, **Resolution 1 of 6 written**. Phase 6 (build) not started; Phase 7 (close out) not done. |
| **git** | Landscape, recall (145), prep, elaboration. No discuss pieces. |
| **typescript** | Landscape, recall (305), prep, elaboration, project spec. |

## What is happening right now — the Discuss track

He read the recall bank and accumulated **64 follow-ups across 63 questions**
(~25,800 words), almost all in Nodes 0–4. Analysis of that corpus found:

- **40 of 64 open by flagging themselves as a repeat** ("again", "same question",
  "I already brought this up")
- Dominant themes: primitives-vs-objects **28/64**, functions/scope/closures 30/64,
  "what exactly does this mean" 29/64, numbers/floating point 20/64,
  references/copies 19/64, coercion/equality 14/64
- An earlier claim that the doubts were "about memory internals" was **wrong** and was
  retracted to him — "in memory" appears 3 times in the whole corpus.

**Conclusion: these are not 64 doubts but roughly six root gaps asked repeatedly.** So
resolutions are written per *gap*, not per question, each listing which follow-ups it
resolves. This is the agreed plan:

1. ✅ **Why a separate language, and how it was wired to the page** — resolves Q1,2,3,7
2. ⬜ The primitive/object division — the largest cluster
3. ⬜ Why there is one number type, and what falls out
4. ⬜ What a reference actually is
5. ⬜ Why first-class functions earned their own vocabulary (his Q41)
6. ⬜ Scope, hoisting and the TDZ as one mechanism

Pieces live in `topics/<slug>/discuss.json` and render in the **Discuss** tab (distinct
from the `? Discuss` marker on cards). Depth calibration: he asked for Resolution 1 to
go **deeper**, so ~23,000 characters with period-accurate code, primary dates, and
explicit corrections of his misconceptions is the right level. Do not compress.

**He is exhausted by the follow-up process** and knows it is inefficient. Advice already
given: after the six pieces exist, read the remaining ~120 questions and only add a
follow-up when something is genuinely new.

## Site features built beyond the base scaffold

All in `assets/globals.js` + `assets/styles.css`, applying to every topic automatically:

- **Markers** per question — Understood / Unclear / Discuss, with a filter bar
- **Follow-up notes** — many per question, timestamped, autosaving, collapsible, with a
  confirmation modal on delete
- **Export / restore** — Markdown (for pasting into a chat) and JSON backup + merge
- **Collapsible disclosure blocks** at every level, with per-node expand/collapse and a
  full-width closing bar at the end of each open block
- **Grouped decks** — topic → node → questions
- Theme: single dark (midnight indigo + amber) and warm cream light. Contrast checked
  with WCAG maths; do not "improve" colours without recomputing.

## His notes are not in this repo

`localStorage` on `devxkapoor.github.io` is the source of truth. Snapshots live at
`~/learning-notes-backups/` (2026-08-26 and 2026-08-27). They are **deliberately outside
this public repo** — 25,000 words of personal study thinking; publishing them is his call
to make, not a default. A backend for durable notes has been discussed but not designed.

To get current data, ask him to Export → Backup (JSON) → Download, then pick it up from
`/mnt/c/Users/devan/Downloads/`.
