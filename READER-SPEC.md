# Read-Aloud Reader — Implementation Spec

Handoff for Claude Code. Target repo: `~/devxkapoor-learning`
(`github.com/devXkapoor/devxkapoor-learning`, deployed via GitHub Pages).

Read this whole file before writing code. Every decision here is already
settled — do not re-open them, and do not add anything not listed.

---

## 1. What this is

An in-page read-aloud player built on the Web Speech API
(`speechSynthesis`), replacing reliance on Microsoft Edge's external Read
Aloud popup. The site now carries enough content
(`topics/javascript/elaboration.json` alone is 375KB) that reading it
visually is no longer practical.

A hardened version of this player was previously built for the standalone
`exp-fps` timeline documents. **That code is not in this repo and is not
in the currently mounted `exp-fps` skill** — it was verified absent. This
is a fresh implementation that reuses the *engineering decisions* below,
not a copy-paste port.

---

## 2. Where it goes — non-negotiable

**`assets/globals.js` and `assets/styles.css`. Nothing else.**

Every page in the repo already loads both:

- `templates/pack-template.html` links `../../assets/styles.css` and
  `../../assets/globals.js`
- every generated `topics/*/pack.html` does the same
- `index.html`, `recall.html`, `search.html` do the same

So implementing once in `globals.js` makes the reader live on `git`,
`javascript`, `typescript`, and every future topic — with **zero
per-topic work and zero backfilling into existing `pack.html` files.**

Do **not**:

- add reader markup to `templates/pack-template.html`
- add reader markup or script to any `topics/*/pack.html`
- touch the `fps` skill (`/mnt/skills/user/fps/`) — leave it entirely alone
- create a new skill for this

The module auto-mounts on load and detects its own context. Pages stay
untouched.

Expose it as `DK.reader` and add it to the `DK` return object at the
bottom of `globals.js` (currently line ~1175).

---

## 3. Existing code you must work with

`assets/globals.js` is a ~44KB IIFE assigned to `const DK`, returning a
flat object. Relevant existing members:

| Member | Why it matters |
|---|---|
| `basePath` | Path resolution under `/devxkapoor-learning/`. Reuse it. |
| `fetchJSON` | How content arrives — **asynchronously, after load**. |
| `makeSectionsCollapsible(root, {startOpen, level})` | Builds the nested `<details>` structure. Levels: `"node"` and `"sub"`. |
| `addExpandControls(scope, root, label)` | Expand-all UI. The reader must not fight it. |
| `addBlockFooter`, `decorateBlocks`, `addCopyButtons` | Inject chrome into the prose — see §6. |
| `renderDeck(container, cards, {bank, topic, showTopic})` | Renders Recall/Prep cards, incl. markers, follow-up notes, filter bar. |
| `plainText`, `highlight`, `ICON`, `revealHash` | Existing utilities — reuse rather than reimplement. |
| `initTheme`, `setTheme`, `setDarkVariant`, `DARK_VARIANTS` | Theme system. |

`assets/styles.css` (~35KB) is a CSS-variable design system with three
themes: dark-navy (default), dark-midnight (`:root[data-dark="midnight"]`),
and light (`:root[data-theme="light"]`). Player styling **must** use the
existing vars (`--bg`, `--panel`, `--panel-raised`, `--border`, `--text`,
`--text-dim`, `--accent`, `--accent-soft`, `--accent-glow`, `--radius`,
`--mono`, `--sans`, `--shadow-lift`) so it survives all three. Honour the
existing `@media (prefers-reduced-motion: reduce)` block at line ~94.

`localStorage` keys in this repo are `dk-` prefixed (`dk-theme`,
`dk-dark`). Follow that convention.

---

## 4. Locked decisions

These were all decided in conversation. Implement exactly.

1. **Code blocks** — `<pre>` content is **skipped** when collecting
   readable units. A toggle in the settings tray enables reading them.
   Default: off.
2. **Deck cards (Recall/Prep)** — read the **question**, then pause. Only
   continue into the answer **if that card is already revealed** in the
   UI. Reading a hidden answer would destroy active recall. Provide an
   opt-in "read answers too" mode for passive listening.
3. **Lock button** — keep an Edge Read-Aloud Lock equivalent: expand-all
   plus *freeze* (clicking titles no longer collapses). Expand-all already
   exists via `addExpandControls`; only the freeze behaviour is new. This
   is the fallback path when the Speech API is unavailable.
4. **Inline ▶** — a small scoped play button on **landscape nodes and
   elaboration sections only**. Not on individual deck cards (hundreds of
   tiny buttons is clutter).
5. **Launcher** — a small **permanent control in the site header**
   (`.site-header .right`, alongside the existing nav and theme toggle).
   Not the invisible hover hot-zone used in the standalone documents —
   different context.
6. **SPA** — **deferred, out of scope.** See §7.
7. **Playback model** — see §5.
8. **Sync script** — irrelevant in Claude Code (direct git access).
   Do not modify `~/sync-learning.sh`.

---

## 5. Playback model

**One engine, many bookmarks.**

The browser exposes exactly one `speechSynthesis`, so only one scope can
ever be speaking. Position memory, however, is **per scope**, keyed
`topic:tab` — e.g. `javascript:elaboration`, `git:prep`. Each bookmark
stores the readable-unit index and a timestamp. Several half-finished
scopes coexist.

Required behaviours:

- **Browsing does not interrupt.** Switching tabs while playing leaves
  audio untouched — it keeps reading Elaboration while the user looks
  through Recall. This is the primary requirement; it is how he actually
  uses the site.
- **"Now playing elsewhere" chip.** When the playing scope ≠ the viewed
  scope, show a compact indicator (e.g. `▸ elaboration · 34/95 · jump
  back`) that scrolls to the live sentence in one click. Without this the
  user loses track of what is speaking.
- **Play is a takeover.** Pressing play (or a scoped inline ▶) while
  viewing a different tab means "read *this*": pause and bookmark the old
  scope at its current sentence, then start the new one — from *its*
  bookmark if present, else the top.
- **Resume granularity** — resume at the **start of the sentence** the
  user was in, never mid-word.

---

## 6. Site-specific hazards

These are why this is not a copy-paste job. Each has bitten a previous
implementation.

**Content arrives async.** Cards and elaboration sections are `fetch`ed
and rendered *after* `DOMContentLoaded`. Do not collect readable units at
load. Build the unit list **at play time**, and rebuild when content
changes (tab switch, filter change, deck re-render).

**Four tabs coexist in the DOM.** `#tab-landscape`, `#tab-recall`,
`#tab-prep`, `#tab-elaboration` — three are `display:none` at any moment,
but all are present. Scope collection to one tab; never walk the whole
document.

**Nested `<details>`, closed by default.** Landscape nodes and elaboration
sections are collapsed at `level:"node"`, with sub-sections inside at
`level:"sub"`. The reader must force-open what it needs, **and restore the
exact prior open/closed state on stop** — including whatever
`addExpandControls` had done. Do not leave the page mutated.

**The pages are full of chrome text.** A blanket "read the body" will
narrate: marker buttons (Understood/Unclear/Discuss), the filter bar and
its live counts, `✎ Follow-up`, `⇪ Export`, copy buttons, collapse
footers, and the `Q1.`/`Q2.` card prefixes. Use an **explicit opt-in
selector set** for readable content — never a blanket subtree walk with
exclusions bolted on afterwards.

---

## 7. Known limits — state honestly, do not work around

- **Audio dies on page navigation.** `pack.html`, `recall.html` and
  `index.html` are separate documents; `speechSynthesis` is destroyed on
  navigation. Within a topic pack (Landscape ↔ Recall ↔ Prep ↔
  Elaboration) playback is fully continuous — those are tabs in one
  document. *Across* pages there is an unavoidable gap; the bookmark
  survives in `localStorage` and play resumes correctly on arrival. The
  only real fix is converting the site to an SPA, which is a separate
  architectural decision and explicitly **out of scope here.**
- **Mobile has no neural voices.** The Microsoft Natural/Online voices
  available in desktop Edge are not reachable through the Web Speech API
  on mobile — on-device voices only. Do not bolt on an untested stream
  from Microsoft's unofficial Edge/Azure TTS endpoint.
- **iOS background playback is best-effort**, even with MediaSession and
  a silent-audio keep-alive, due to platform background-audio rules.

---

## 8. Engine reliability — the four Chromium bugs

A previous build hit an "audio halts but progress keeps moving" failure.
Root causes and required fixes:

1. **Never trust `pause()` / `resume()`.** Pause must `cancel()` and
   remember position; resume re-speaks from the last spoken word.
2. **Never call `speak()` synchronously after `cancel()`.** Route all
   speech through a `safeSpeak()` that waits for the engine to settle.
3. **Drive all state from utterance events** via an explicit
   `idle | playing | paused` state machine — never from
   `synth.speaking` / `synth.paused`, which are unreliable.
4. **Bounded watchdog.** Detect dropped or stalled utterances and
   re-speak from the last word, with a bound so it cannot loop.

Additional engine requirements:

- **Sentence-by-sentence utterances.** Chromium silently truncates
  utterances past roughly 15 seconds. One sentence per utterance,
  advancing on `onend`. Chunk long sentences further at word boundaries
  (≤220 chars).
- **CSS Custom Highlight API** for live sentence and word highlighting —
  it highlights arbitrary ranges without wrapping spans, so inline
  `<strong>` / `<em>` inside prose never break it. No DOM mutation.
- **`getVoices()` is async** — it returns `[]` on the first synchronous
  call. Populate via the `voiceschanged` event.
- **Voice labels**: `SpeechSynthesisVoice` exposes only `.name` and
  `.lang`, and `.name` is already the full display string. Do not
  reconstruct labels from other properties — that produced a
  "Microsoft undefined Online (Natural) - undefined" bug previously.
- **MediaSession** metadata title set to the current sentence and updated
  continuously, so the lock screen shows what is being narrated.
- **Progressive enhancement** — if `speechSynthesis` is absent, the
  launcher does not render and the Lock button (§4.3) still works.

---

## 9. Controls

Player bar: play/pause, prev/next sentence, stop, progress bar with
elapsed/total, speed selector (0.6×–2×), voice picker (English voices,
natural/online ones listed first and marked), and a settings tray with
pitch, the read-code-blocks toggle, and the read-answers toggle.

Voice picker: a single full-width selector button showing the current
voice name and a chevron, opening a browsable list that stays open until
explicitly dismissed, with per-voice preview buttons.

Keyboard, while the player is open: `Space` play/pause, `←`/`→` prev/next
sentence, `Esc` close.

Voice, speed and pitch persist in `localStorage` under `dk-` keys.

Responsive: 393px phone, laptop, and 2K. No exceptions.

---

## 10. Testing before push

- `node --check` the modified `globals.js`.
- Exercise against `topics/javascript/pack.html` — it is the heaviest
  content in the repo (375KB elaboration) and will surface performance
  and unit-collection problems the smaller topics will not.
- Verify all four tabs collect units correctly and that chrome text
  (markers, filter bar, `Q1.` prefixes, copy buttons) is never spoken.
- Verify open/closed `<details>` state is restored exactly on stop.
- Verify the player renders correctly in all three themes.
- Verify graceful degradation with `speechSynthesis` stubbed out.

---

## 11. After the reader works

One small addition to the `topic-mastery` skill: a short section in
`references/repo-workflow.md` documenting the reader — principally the
**readable-content contract** (which selectors are opt-in for narration),
so future topic sessions generating landscape and elaboration HTML do not
produce markup the reader cannot see or reads as chrome. Ten lines, not a
rewrite. Do not otherwise modify the skill.

---

## 12. Working agreement

- Fix from the core, all cases covered, no coupling between features.
- Never add features that were not authorised.
- If something breaks while fixing something else, actually fix the
  break — do not patch around it.
- Be direct about platform limitations rather than shipping untested
  workarounds.
- Run the git add/commit/push directly; state the short SHA in one line
  and continue.
