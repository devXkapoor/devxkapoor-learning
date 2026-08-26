// devxkapoor-learning :: shared data loading + boot sequence
// Used by index.html, recall.html, search.html, and per-topic pack.html files.

const DK = (() => {
  const basePath = (() => {
    const path = window.location.pathname;
    const marker = "/devxkapoor-learning/";
    if (path.includes(marker)) {
      return path.slice(0, path.indexOf(marker) + marker.length);
    }
    return "/";
  })();

  async function fetchJSON(relPath) {
    try {
      const res = await fetch(basePath + relPath, { cache: "no-cache" });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("DK.fetchJSON failed for", relPath, e);
      return null;
    }
  }

  async function loadTracker() {
    return await fetchJSON("tracker.json");
  }

  async function loadAllRecall(tracker) {
    const all = [];
    const slugs = tracker.sections.flatMap(s => s.topics);
    for (const slug of slugs) {
      const data = await fetchJSON(`topics/${slug}/recall.json`);
      if (data && Array.isArray(data.cards)) {
        data.cards.forEach(c => all.push({ ...c, topic: slug }));
      }
    }
    return all;
  }

  async function loadAllElaboration(tracker) {
    const all = [];
    const slugs = tracker.sections.flatMap(s => s.topics);
    for (const slug of slugs) {
      const data = await fetchJSON(`topics/${slug}/elaboration.json`);
      if (data && Array.isArray(data.sections)) {
        data.sections.forEach(s => all.push({ ...s, topic: slug }));
      }
    }
    return all;
  }

  function statusOf(tracker, slug) {
    return (tracker.status && tracker.status[slug] && tracker.status[slug].state) || "not-started";
  }

  // Renders a one-time boot sequence into the given element, then calls onDone.
  // Respects prefers-reduced-motion by skipping straight to onDone.
  function runBoot(el, lines, onDone) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || sessionStorage.getItem("dk-booted")) {
      onDone();
      return;
    }
    sessionStorage.setItem("dk-booted", "1");
    let i = 0;
    function next() {
      if (i >= lines.length) { onDone(); return; }
      const div = document.createElement("div");
      div.className = "line " + (lines[i].type || "");
      div.textContent = lines[i].text;
      el.appendChild(div);
      i++;
      setTimeout(next, lines[i - 1].delay || 90);
    }
    next();
  }

  // Theme: persisted in localStorage, defaults to dark. Call initTheme() early
  // (before paint ideally) and wireThemeToggle(buttonEl) once the DOM is ready.
  function initTheme() {
    const saved = localStorage.getItem("dk-theme");
    const theme = saved || "dark";
    document.documentElement.setAttribute("data-theme", theme);
    return theme;
  }

  function wireThemeToggle(btnEl) {
    function updateLabel() {
      const current = document.documentElement.getAttribute("data-theme");
      btnEl.textContent = current === "light" ? "☾" : "☀";
      btnEl.setAttribute("aria-label", current === "light" ? "Switch to dark theme" : "Switch to light theme");
    }
    updateLabel();
    btnEl.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("dk-theme", next);
      updateLabel();
    });
  }


  // ---------- Question marks (understood / unclear / discuss) ----------
  // Stored per topic + bank + question number so they survive across sessions
  // and stay separate for recall vs prep and for every topic.
  const MARKS_KEY = "dk-marks-v1";

  const MARK_TYPES = [
    { id: "got",     label: "Understood", glyph: "✓" },
    { id: "unclear", label: "Unclear",    glyph: "~" },
    { id: "discuss", label: "Discuss",    glyph: "?" },
  ];

  function loadMarks() {
    try {
      return JSON.parse(localStorage.getItem(MARKS_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveMarks(marks) {
    try {
      localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
    } catch (e) {
      console.warn("DK: could not persist marks", e);
    }
  }

  function markKey(topic, bank, n) {
    return `${topic}:${bank}:${n}`;
  }

  function getMark(topic, bank, n) {
    return loadMarks()[markKey(topic, bank, n)] || "";
  }

  function setMark(topic, bank, n, mark) {
    const marks = loadMarks();
    const key = markKey(topic, bank, n);
    if (!mark) delete marks[key];
    else marks[key] = mark;
    saveMarks(marks);
  }


  // ---------- Follow-up notes (per question, many per question) ----------
  // Each question can hold a list of notes. Clicking "+ Follow-up" always opens
  // a NEW empty box; existing notes stay stacked above it. Saving is automatic.
  const NOTES_KEY = "dk-notes-v1";

  function loadNotes() {
    try {
      return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveNotes(notes) {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch (e) {
      console.warn("DK: could not persist notes", e);
    }
  }

  // Returns the stored notes for a question, dropping any that were left blank.
  function getNotes(topic, bank, n) {
    const list = loadNotes()[markKey(topic, bank, n)] || [];
    return list.filter((note) => (note.text || "").trim() !== "");
  }

  function setNotes(topic, bank, n, list) {
    const notes = loadNotes();
    const key = markKey(topic, bank, n);
    const kept = list.filter((note) => (note.text || "").trim() !== "");
    if (!kept.length) delete notes[key];
    else notes[key] = kept;
    saveNotes(notes);
  }

  function noteCount(topic, bank, n) {
    return getNotes(topic, bank, n).length;
  }

  function formatNoteTime(ts) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      }).format(new Date(ts));
    } catch (e) {
      return "";
    }
  }


  // ---------- Export / import ----------
  // Markdown export is for pasting into a chat: it includes the question text,
  // the marker, and every follow-up note, for whatever is currently in scope.
  // JSON export is a full backup of all marks and notes across every topic.

  const MARK_LABEL = { got: "Understood", unclear: "Unclear", discuss: "Discuss" };

  function buildMarkdown(cards, bank, topicOf, scopeLabel) {
    const rows = [];
    cards.forEach((c) => {
      const topic = topicOf(c);
      const mark = getMark(topic, bank, c.n);
      const notes = getNotes(topic, bank, c.n);
      if (!mark && !notes.length) return;
      rows.push({ topic, card: c, mark, notes });
    });

    if (!rows.length) {
      return `No marked questions or follow-ups in ${scopeLabel} yet.`;
    }

    const out = [];
    out.push(`# Study notes — ${scopeLabel}`);
    out.push("");
    out.push(`${rows.length} question${rows.length === 1 ? "" : "s"} with a marker or follow-up.`);
    out.push("");

    rows.forEach(({ topic, card, mark, notes }) => {
      const heading = `Q${card.n}` + (card.t ? ` · ${card.t}` : "");
      out.push(`## ${heading}`);
      out.push(`**Topic:** ${topic} · ${bank}`);
      if (mark) out.push(`**Marked:** ${MARK_LABEL[mark] || mark}`);
      out.push("");
      out.push(`**Q:** ${stripTags(card.q)}`);
      out.push("");
      out.push(`**A:** ${stripTags(card.a)}`);
      if (notes.length) {
        out.push("");
        out.push("**My follow-ups:**");
        notes.forEach((nt) => {
          out.push(`- (${formatNoteTime(nt.ts)}) ${nt.text.trim()}`);
        });
      }
      out.push("");
      out.push("---");
      out.push("");
    });

    return out.join("\n");
  }

  // Strips markup and decodes entities. Uses the DOM so every entity is handled
  // (&mdash;, &rsquo;, numeric refs), with a plain-string fallback if unavailable.
  function stripTags(html) {
    const withoutTags = String(html || "").replace(/<[^>]*>/g, "");
    let text = withoutTags;
    try {
      const el = document.createElement("textarea");
      el.innerHTML = withoutTags;
      if (typeof el.value === "string" && el.value) text = el.value;
    } catch (e) {
      text = withoutTags
        .replace(/&mdash;/g, "\u2014")
        .replace(/&ndash;/g, "\u2013")
        .replace(/&hellip;/g, "\u2026")
        .replace(/&nbsp;/g, " ")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function buildBackup() {
    return JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), marks: loadMarks(), notes: loadNotes() },
      null,
      2
    );
  }

  // Merges a backup into what's already stored. Incoming values win on conflict;
  // notes for the same question are concatenated and de-duplicated by text.
  function importBackup(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("That isn't valid JSON.");
    }
    if (!data || typeof data !== "object" || (!data.marks && !data.notes)) {
      throw new Error("That JSON doesn't look like a marks/notes backup.");
    }

    const marks = loadMarks();
    let markCount = 0;
    Object.entries(data.marks || {}).forEach(([k, v]) => {
      if (typeof v === "string" && v) { marks[k] = v; markCount++; }
    });
    saveMarks(marks);

    const notes = loadNotes();
    let noteCountAdded = 0;
    Object.entries(data.notes || {}).forEach(([k, list]) => {
      if (!Array.isArray(list)) return;
      const existing = notes[k] || [];
      const seen = new Set(existing.map((nt) => (nt.text || "").trim()));
      list.forEach((nt) => {
        const t = (nt && nt.text ? nt.text : "").trim();
        if (!t || seen.has(t)) return;
        existing.push({ ts: nt.ts || Date.now(), text: t });
        seen.add(t);
        noteCountAdded++;
      });
      if (existing.length) notes[k] = existing;
    });
    saveNotes(notes);

    return { marks: markCount, notes: noteCountAdded };
  }

  function openExportDialog(cards, bank, topicOf, scopeLabel) {
    const overlay = document.createElement("div");
    overlay.className = "dk-modal-overlay";
    overlay.innerHTML =
      `<div class="dk-modal" role="dialog" aria-label="Export study notes">` +
        `<div class="dk-modal-head">` +
          `<strong>Export — ${scopeLabel}</strong>` +
          `<button class="dk-modal-close" type="button" aria-label="Close">×</button>` +
        `</div>` +
        `<div class="dk-modal-tabs">` +
          `<button class="dk-mt active" data-fmt="md" type="button">For chat (Markdown)</button>` +
          `<button class="dk-mt" data-fmt="json" type="button">Backup (JSON)</button>` +
          `<button class="dk-mt" data-fmt="import" type="button">Restore</button>` +
        `</div>` +
        `<textarea class="dk-modal-text" spellcheck="false"></textarea>` +
        `<div class="dk-modal-note"></div>` +
        `<div class="dk-modal-actions">` +
          `<button class="dk-ma primary" data-act="copy" type="button">Copy</button>` +
          `<button class="dk-ma" data-act="download" type="button">Download</button>` +
          `<button class="dk-ma" data-act="restore" type="button" hidden>Restore from this JSON</button>` +
        `</div>` +
      `</div>`;
    document.body.appendChild(overlay);

    const ta = overlay.querySelector(".dk-modal-text");
    const note = overlay.querySelector(".dk-modal-note");
    const copyBtn = overlay.querySelector('[data-act="copy"]');
    const dlBtn = overlay.querySelector('[data-act="download"]');
    const restoreBtn = overlay.querySelector('[data-act="restore"]');
    let fmt = "md";

    function setFormat(next) {
      fmt = next;
      overlay.querySelectorAll(".dk-mt").forEach((b) => b.classList.toggle("active", b.dataset.fmt === next));
      const isImport = next === "import";
      copyBtn.hidden = isImport;
      dlBtn.hidden = isImport;
      restoreBtn.hidden = !isImport;
      if (next === "md") {
        ta.value = buildMarkdown(cards, bank, topicOf, scopeLabel);
        ta.readOnly = true;
        note.textContent = "Only questions with a marker or a follow-up are included. Reflects the filter you have applied.";
      } else if (next === "json") {
        ta.value = buildBackup();
        ta.readOnly = true;
        note.textContent = "Everything — all marks and follow-ups, every topic and both banks. Keep this to move between devices.";
      } else {
        ta.value = "";
        ta.readOnly = false;
        note.textContent = "Paste a backup JSON here, then press Restore. It merges with what's already saved — nothing is deleted.";
      }
    }

    function close() {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);

    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector(".dk-modal-close").addEventListener("click", close);
    overlay.querySelectorAll(".dk-mt").forEach((b) =>
      b.addEventListener("click", () => setFormat(b.dataset.fmt))
    );

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        copyBtn.textContent = "Copied";
      } catch (e) {
        ta.select();
        copyBtn.textContent = "Press Ctrl+C";
      }
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1800);
    });

    dlBtn.addEventListener("click", () => {
      const ext = fmt === "json" ? "json" : "md";
      const name = `${scopeLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-notes.${ext}`;
      const blob = new Blob([ta.value], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    restoreBtn.addEventListener("click", () => {
      try {
        const res = importBackup(ta.value);
        note.textContent = `Restored ${res.marks} mark(s) and ${res.notes} new follow-up(s). Reload to see them.`;
      } catch (err) {
        note.textContent = "Could not restore: " + err.message;
      }
    });

    setFormat("md");
  }

  // Renders a deck of question cards with per-card marking and a filter bar.
  // listEl   — the .card-list element to render cards into
  // cards    — array of {n, t, q, a, topic?}
  // opts     — { bank: "recall"|"prep", topic: <slug>, showTopic: bool }
  function renderDeck(listEl, cards, opts) {
    const bank = opts.bank;
    const defaultTopic = opts.topic || "";
    const showTopic = !!opts.showTopic;
    const topicOf = (c) => c.topic || defaultTopic;

    let activeFilter = "all";
    let textFilter = "";

    // Build the filter bar once, immediately before the list.
    const bar = document.createElement("div");
    bar.className = "mark-filter";
    listEl.parentNode.insertBefore(bar, listEl);

    function countsFor() {
      const marks = loadMarks();
      const counts = { all: cards.length, unmarked: 0, got: 0, unclear: 0, discuss: 0, noted: 0 };
      cards.forEach((c) => {
        const topic = topicOf(c);
        const m = marks[markKey(topic, bank, c.n)] || "";
        if (!m) counts.unmarked++;
        else if (counts[m] !== undefined) counts[m]++;
        if (noteCount(topic, bank, c.n) > 0) counts.noted++;
      });
      return counts;
    }

    function drawBar() {
      const counts = countsFor();
      const buttons = [
        { id: "all", label: "All" },
        { id: "unmarked", label: "Unmarked" },
        ...MARK_TYPES.map((m) => ({ id: m.id, label: `${m.glyph} ${m.label}` })),
        { id: "noted", label: "✎ Has follow-ups" },
      ];
      bar.innerHTML = buttons
        .map(
          (b) =>
            `<button class="mf-btn${b.id === activeFilter ? " active" : ""}" data-filter="${b.id}" data-kind="${b.id}">` +
            `${b.label} <span class="mf-count">${counts[b.id]}</span></button>`
        )
        .join("");
      bar.innerHTML += `<button class="mf-btn mf-export" data-act="export" type="button">⇪ Export</button>`;
      bar.querySelectorAll(".mf-btn").forEach((btn) => {
        if (btn.dataset.act === "export") {
          btn.addEventListener("click", () => {
            const scope = (defaultTopic || "all topics").replace(/-/g, " ") + " · " + bank;
            openExportDialog(cards.filter(passesFilter), bank, topicOf, scope);
          });
          return;
        }
        btn.addEventListener("click", () => {
          activeFilter = btn.dataset.filter;
          drawBar();
          drawCards();
        });
      });
    }

    function passesFilter(c) {
      const topic = topicOf(c);
      const m = getMark(topic, bank, c.n);
      if (activeFilter === "noted") {
        if (noteCount(topic, bank, c.n) === 0) return false;
      } else if (activeFilter === "unmarked") {
        if (m) return false;
      } else if (activeFilter !== "all" && m !== activeFilter) {
        return false;
      }
      if (textFilter) {
        const hay = `${topicOf(c)} ${c.t || ""} ${c.q || ""}`.toLowerCase();
        if (!hay.includes(textFilter.toLowerCase())) return false;
      }
      return true;
    }

    function drawCards() {
      listEl.innerHTML = "";
      const shown = cards.filter(passesFilter);
      if (!shown.length) {
        listEl.innerHTML = "<p class='empty-note'>no questions match this filter</p>";
        return;
      }
      shown.forEach((c) => {
        const topic = topicOf(c);
        const mark = getMark(topic, bank, c.n);
        const card = document.createElement("div");
        card.className = "rc-card";
        if (mark) card.setAttribute("data-mark", mark);
        const num = c.n ? `Q${c.n}. ` : "";
        const tag = showTopic
          ? `${topic.replace(/-/g, " ")}${c.t ? " · " + c.t : ""}`
          : (c.t || "");
        const marksHtml = MARK_TYPES.map(
          (m) =>
            `<button class="mk-btn${mark === m.id ? " on" : ""}" data-mark="${m.id}" ` +
            `title="${m.label}" aria-label="${m.label}"><span class="mk-g">${m.glyph}</span>${m.label}</button>`
        ).join("");
        card.innerHTML =
          `<div class="topic-tag">${tag}</div>` +
          `<div class="q">${num}${c.q}</div>` +
          `<div class="a">${c.a}</div>` +
          `<div class="mk-row">${marksHtml}` +
          `<button class="nt-add" type="button">✎ Follow-up</button></div>` +
          `<div class="nt-list"></div>`;

        card.addEventListener("click", () => card.classList.toggle("revealed"));

        card.querySelectorAll(".mk-btn").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const want = btn.dataset.mark;
            const current = getMark(topic, bank, c.n);
            const next = current === want ? "" : want;
            setMark(topic, bank, c.n, next);
            if (next) card.setAttribute("data-mark", next);
            else card.removeAttribute("data-mark");
            card.querySelectorAll(".mk-btn").forEach((b) =>
              b.classList.toggle("on", b.dataset.mark === next)
            );
            drawBar();
            if (activeFilter !== "all") drawCards();
          });
        });

        wireNotes(card, topic, c.n);
        listEl.appendChild(card);
      });
    }

    // Builds the follow-up note UI for one card. Notes save automatically as
    // you type; "+ Follow-up" always appends a fresh empty box.
    // Builds the follow-up note UI for one card.
    //
    // Behaviour: notes save automatically as you type. "+ Follow-up" always
    // appends a fresh empty box. A box grows with the text up to a cap, then
    // scrolls internally so a long dictated note can't swallow the page.
    // "Done" collapses a note to a one-line summary; existing notes start
    // collapsed so revisiting a question stays readable.
    function wireNotes(card, topic, n) {
      const listWrap = card.querySelector(".nt-list");
      const addBtn = card.querySelector(".nt-add");
      let working = getNotes(topic, bank, n).slice();

      function persist() {
        setNotes(topic, bank, n, working);
        updateAddLabel();
      }

      function updateAddLabel() {
        const saved = working.filter((x) => (x.text || "").trim() !== "").length;
        addBtn.textContent = saved ? `✎ Follow-up (${saved})` : "✎ Follow-up";
        card.classList.toggle("has-notes", saved > 0);
      }

      // Grows to fit content up to the CSS max-height, then lets the textarea
      // scroll. Reading the computed max-height keeps JS and CSS in agreement.
      function autoGrow(ta) {
        ta.style.height = "auto";
        let cap = 260;
        try {
          const parsed = parseInt(getComputedStyle(ta).maxHeight, 10);
          if (!Number.isNaN(parsed)) cap = parsed;
        } catch (e) { /* keep the default cap */ }
        const wanted = Math.max(ta.scrollHeight, 44);
        ta.style.height = Math.min(wanted, cap) + "px";
        ta.classList.toggle("is-capped", wanted > cap);
      }

      function summarise(text) {
        const clean = (text || "").replace(/\s+/g, " ").trim();
        if (!clean) return "empty follow-up";
        return clean.length > 110 ? clean.slice(0, 110) + "…" : clean;
      }

      function drawNote(note, startCollapsed) {
        const item = document.createElement("div");
        item.className = "nt-item" + (startCollapsed ? " collapsed" : "");

        const meta = document.createElement("div");
        meta.className = "nt-meta";
        const ts = document.createElement("span");
        ts.className = "nt-ts";
        ts.textContent = formatNoteTime(note.ts);
        const status = document.createElement("span");
        status.className = "nt-status";
        const spacer = document.createElement("span");
        spacer.className = "nt-spacer";
        const doneBtn = document.createElement("button");
        doneBtn.className = "nt-done";
        doneBtn.type = "button";
        doneBtn.textContent = "Done";
        doneBtn.title = "Save and collapse this follow-up";
        const del = document.createElement("button");
        del.className = "nt-del";
        del.type = "button";
        del.textContent = "×";
        del.title = "Delete this follow-up";
        del.setAttribute("aria-label", "Delete this follow-up");
        meta.appendChild(ts);
        meta.appendChild(status);
        meta.appendChild(spacer);
        meta.appendChild(doneBtn);
        meta.appendChild(del);

        // Collapsed view — one line, click to reopen.
        const summary = document.createElement("div");
        summary.className = "nt-summary";
        summary.setAttribute("role", "button");
        summary.setAttribute("tabindex", "0");
        summary.textContent = summarise(note.text);

        const ta = document.createElement("textarea");
        ta.className = "nt-text";
        ta.rows = 2;
        ta.placeholder = "what's the doubt?";
        ta.value = note.text || "";

        item.appendChild(meta);
        item.appendChild(summary);
        item.appendChild(ta);
        listWrap.appendChild(item);

        function expand() {
          item.classList.remove("collapsed");
          autoGrow(ta);
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
        function collapse() {
          persist();
          summary.textContent = summarise(note.text);
          item.classList.add("collapsed");
        }

        if (!startCollapsed) autoGrow(ta);

        // Interacting with a note must never toggle the answer reveal.
        item.addEventListener("click", (e) => e.stopPropagation());

        summary.addEventListener("click", expand);
        summary.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expand(); }
        });

        let timer = null;
        let statusTimer = null;
        function flagSaved() {
          status.textContent = "saved";
          clearTimeout(statusTimer);
          statusTimer = setTimeout(() => { status.textContent = ""; }, 1200);
        }

        ta.addEventListener("input", () => {
          note.text = ta.value;
          const atEnd = ta.selectionStart === ta.value.length;
          autoGrow(ta);
          // While dictating, keep the caret in view rather than stranding it
          // above the fold once the box has hit its cap.
          if (atEnd) ta.scrollTop = ta.scrollHeight;
          status.textContent = "saving…";
          clearTimeout(timer);
          timer = setTimeout(() => { persist(); flagSaved(); }, 300);
        });
        ta.addEventListener("blur", () => { persist(); });

        doneBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          collapse();
          flagSaved();
        });

        // Deleting a long note by accident would be unrecoverable, so the
        // first click arms and the second confirms.
        let armed = false;
        let armTimer = null;
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!armed) {
            armed = true;
            del.textContent = "delete?";
            del.classList.add("armed");
            armTimer = setTimeout(() => {
              armed = false;
              del.textContent = "×";
              del.classList.remove("armed");
            }, 3500);
            return;
          }
          clearTimeout(armTimer);
          working.splice(working.indexOf(note), 1);
          persist();
          item.remove();
          if (activeFilter === "noted" && !working.length) drawCards();
          drawBar();
        });

        return ta;
      }

      // Existing notes start collapsed; a question with six long follow-ups
      // should read as six lines, not six walls of text.
      working.forEach((note) => drawNote(note, true));
      updateAddLabel();

      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const note = { ts: Date.now(), text: "" };
        working.push(note);
        const ta = drawNote(note, false);
        ta.focus();
      });
    }

    drawBar();
    drawCards();

    return {
      setTextFilter(v) {
        textFilter = v || "";
        drawCards();
        drawBar();
      },
    };
  }

  return { basePath, fetchJSON, loadTracker, loadAllRecall, loadAllElaboration, statusOf, runBoot, initTheme, wireThemeToggle, getMark, setMark, renderDeck, MARK_TYPES, getNotes, setNotes, noteCount, buildMarkdown, buildBackup, importBackup };
})();

// Apply theme immediately on script load (before body renders) to avoid a flash.
DK.initTheme();
