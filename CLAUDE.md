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

## What is happening right now — the Discuss track (Phase 8)

He read 63 recall questions and left **64 follow-up notes** (~25,800 words), almost all
in Nodes 0–4. They are dictated by voice: long, unpunctuated, circling back, and each
containing several distinct asks.

### The rule, which was corrected once — do not get this wrong again

**Answer one follow-up at a time, in question order. Never cluster.**

The first attempt analysed the corpus, found the doubts fell into roughly six recurring
themes, and wrote one long piece per theme. He rejected it, for reasons worth keeping:

- **He writes each follow-up deliberately.** Clustering compresses several into a
  summary and silently drops whatever did not fit the theme. In his words, he does not
  want to compromise on anything, having put real effort into expressing them.
- **Later follow-ups reference earlier ones.** About two-thirds open with "again" or
  "same as the previous question". Answering out of order breaks a thread he built in
  order.

So: the first question that has a follow-up, then the next, and so on. Cross-reference
freely — "this is the same ground as Q17, and here is what changes" — but still answer
*this* follow-up's own framing in full.

### Method

Read the whole follow-up. **List the distinct asks you found**, so he sees his own
questions reflected back before they are answered. Then answer every one; if one cannot
be answered, say so rather than letting it vanish.

**No length limit.** He asked for more depth after seeing the first piece. The accepted
calibration is ~20,000+ characters with period-accurate code, real dates and versions,
mechanism traced to the substrate, and explicit correction of misconceptions — including
our own earlier looseness where he catches it. Do not compress.

Full format: `~/.claude/skills/topic-mastery/references/resolution-format.md`.

### State

- **Resolution 1** exists and covers Q1/Q2/Q3/Q7 together — written under the old
  clustered approach. He said to leave it in place.
- **Everything from here restarts at the first follow-up and proceeds one at a time.**
  Resolution 1 already covers some of Q1's ground; reference it rather than repeating it,
  but still address anything in Q1's follow-up it did not answer.

Pieces live in `topics/<slug>/discuss.json` and render in the **Discuss** tab — unrelated
to the `? Discuss` marker on cards. Push after each one.

An earlier claim that the doubts were "about memory internals" was **wrong** and was
retracted to him; "in memory" appears three times in the whole corpus.

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
