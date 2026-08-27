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

  // Only topics that appear in tracker.status have files on disk; walking all
  // ~112 catalog slugs meant ~109 sequential 404s, which took roughly half a
  // minute and made the global pages look broken. Filter, then fetch together.
  function startedSlugs(tracker) {
    const known = new Set(Object.keys(tracker.status || {}));
    return tracker.sections
      .flatMap((s) => s.topics)
      .filter((slug) => known.has(slug));
  }

  async function loadAllRecall(tracker) {
    const slugs = startedSlugs(tracker);
    const results = await Promise.all(
      slugs.map(async (slug) => {
        const data = await fetchJSON(`topics/${slug}/recall.json`);
        return data && Array.isArray(data.cards)
          ? data.cards.map((c) => ({ ...c, topic: slug }))
          : [];
      })
    );
    return results.flat();
  }

  async function loadAllPrep(tracker) {
    const slugs = startedSlugs(tracker);
    const results = await Promise.all(
      slugs.map(async (slug) => {
        const data = await fetchJSON(`topics/${slug}/prep.json`);
        return data && Array.isArray(data.cards)
          ? data.cards.map((c) => ({ ...c, topic: slug }))
          : [];
      })
    );
    return results.flat();
  }

  async function loadAllElaboration(tracker) {
    const slugs = startedSlugs(tracker);
    const results = await Promise.all(
      slugs.map(async (slug) => {
        const data = await fetchJSON(`topics/${slug}/elaboration.json`);
        return data && Array.isArray(data.sections)
          ? data.sections.map((s) => ({ ...s, topic: slug }))
          : [];
      })
    );
    return results.flat();
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
    const theme = localStorage.getItem("dk-theme") || "dark";
    document.documentElement.setAttribute("data-theme", theme);
    return theme;
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("dk-theme", theme);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("dk-theme", theme);
  }

  // A small menu rather than a two-state toggle, so both dark palettes are
  // reachable and comparable without editing anything.
  function wireThemeToggle(btnEl) {
    if (!btnEl) return;
    function paint() {
      const dark = (document.documentElement.getAttribute("data-theme") || "dark") !== "light";
      btnEl.textContent = dark ? "☀" : "☾";
      btnEl.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    }
    paint();
    btnEl.addEventListener("click", () => {
      const dark = (document.documentElement.getAttribute("data-theme") || "dark") !== "light";
      setTheme(dark ? "light" : "dark");
      paint();
    });
  }



  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Inline SVG so icons inherit currentColor and need no external requests.
  const ICON = {
    copy: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="9" rx="1.5"/><path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1"/></svg>',
    check: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5L13 5"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>',
    trash: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4"/><path d="M6.5 7v4M9.5 7v4"/></svg>',
    done: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5L13 5"/></svg>',
  };

  // ---------- Prose enhancement: collapsible sections + code copy ----------
  // The landscape and elaboration tabs are long-form HTML. Rendered flat they
  // read as one undivided wall, with no way to navigate or to collapse what
  // you've already read. This restructures them at runtime so the source HTML
  // stays simple: each <h3> becomes a collapsible section, closed by default.

  function addCopyButtons(root) {
    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.parentElement && pre.parentElement.classList.contains("code-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "code-wrap";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);

      const btn = document.createElement("button");
      btn.className = "code-copy";
      btn.type = "button";
      btn.title = "Copy to clipboard";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      btn.innerHTML = ICON.copy;
      wrap.appendChild(btn);

      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const text = pre.innerText;
        try {
          await navigator.clipboard.writeText(text);
        } catch (err) {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); } catch (e2) { /* nothing else to try */ }
          ta.remove();
        }
        btn.innerHTML = ICON.check;
        btn.classList.add("copied");
        setTimeout(() => {
          btn.innerHTML = ICON.copy;
          btn.classList.remove("copied");
        }, 1400);
      });
    });
  }

  // Groups each <h3> with the nodes that follow it into a <details> block.
  // Native <details>/<summary> — the ARIA "disclosure" pattern — gets keyboard
  // handling and screen-reader semantics for free.
  //
  // Everything starts closed. Opening a node must not dump its whole subtree
  // on you; you open what you want, one level at a time.
  function makeSectionsCollapsible(root, opts) {
    const o = opts || {};
    const startOpen = !!o.startOpen;
    const level = o.level || "node";
    const headings = Array.from(root.children).filter((el) => el.tagName === "H3");
    if (!headings.length) return 0;

    headings.forEach((h) => {
      const details = document.createElement("details");
      details.className = level === "sub" ? "sub-block" : "node-block";
      if (startOpen) details.open = true;

      const summary = document.createElement("summary");
      summary.className = "node-summary";
      summary.innerHTML =
        `<span class="node-chevron">${ICON.chevron}</span>` +
        `<span class="node-title">${h.innerHTML}</span>`;
      details.appendChild(summary);

      const body = document.createElement("div");
      body.className = "node-body";
      details.appendChild(body);

      root.insertBefore(details, h);
      h.remove();

      while (details.nextSibling && details.nextSibling.tagName !== "H3") {
        body.appendChild(details.nextSibling);
      }
    });
    return headings.length;
  }

  // Adds a "Collapse" control at the *end* of an open block, so you never have
  // to scroll back up to the header to close something you've finished reading.
  // Long elaboration sections make this the difference between usable and not.
  // A closing bar at the *end* of an open block, mirroring the header: the
  // whole strip is the hit target, so collapsing is the same gesture as
  // expanding rather than hunting for a small button in a corner.
  function addBlockFooter(details, label) {
    if (!details || details.querySelector(":scope > .node-foot")) return;
    const body = details.querySelector(":scope > .node-body");
    if (!body) return;

    const foot = document.createElement("button");
    foot.className = "node-foot";
    foot.type = "button";
    foot.setAttribute("aria-label", label || "Collapse");
    foot.innerHTML =
      `<span class="nf-chev">${ICON.chevron}</span>` +
      `<span class="nf-label">${label || "Collapse"}</span>` +
      `<span class="nf-chev">${ICON.chevron}</span>`;

    // Appended to the <details> itself, NOT inside .node-body. The body is
    // padded, and different block types pad differently, so anything nested
    // inside it can only reach full width by cancelling that padding with
    // negative margins — which has to be kept in sync with four separate
    // padding values and silently breaks when one changes. As a direct child
    // it spans the block edge-to-edge on its own, matching the header exactly.
    details.appendChild(foot);

    foot.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      details.open = false;
      // If the header scrolled out of view, bring it back rather than leaving
      // the reader stranded mid-page.
      const top = details.getBoundingClientRect().top;
      if (top < 0) details.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  // Local expand/collapse for the sub-blocks inside one node.
  function addLocalControls(details) {
    const body = details.querySelector(".node-body");
    if (!body) return;
    const subs = body.querySelectorAll("details.sub-block");
    if (!subs.length || body.querySelector(":scope > .node-local")) return;

    const bar = document.createElement("div");
    bar.className = "node-local";
    bar.innerHTML =
      `<span class="nl-label">${subs.length} sections</span>` +
      `<button class="pc-btn" data-act="expand" type="button">Expand all</button>` +
      `<button class="pc-btn" data-act="collapse" type="button">Collapse all</button>`;
    body.insertBefore(bar, body.firstChild);
    bar.addEventListener("click", (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      subs.forEach((d) => { d.open = act === "expand"; });
    });
  }

  // Applies footers and local controls across a whole tree of blocks.
  function decorateBlocks(root) {
    root.querySelectorAll("details.node-block, details.el-block").forEach((d) => {
      addLocalControls(d);
      addBlockFooter(d, "Collapse this section");
    });
    root.querySelectorAll("details.sub-block").forEach((d) => {
      addBlockFooter(d, "Collapse");
    });
  }

  // Adds an expand-all / collapse-all bar above a set of <details> blocks.
  function addExpandControls(container, targetRoot, label) {
    const bar = document.createElement("div");
    bar.className = "prose-controls";
    bar.innerHTML =
      `<span class="pc-label">${label}</span>` +
      `<button class="pc-btn" data-act="expand" type="button">Expand all</button>` +
      `<button class="pc-btn" data-act="collapse" type="button">Collapse all</button>`;
    container.insertBefore(bar, container.firstChild);
    bar.addEventListener("click", (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      targetRoot.querySelectorAll("details.node-block, details.el-block, details.sub-block").forEach((d) => {
        d.open = act === "expand";
      });
    });
    return bar;
  }

  // Opens whichever collapsed block contains the element the URL points at,
  // so a link from search.html still lands somewhere visible.
  function revealHash() {
    if (!window.location.hash) return;
    let el = null;
    try { el = document.querySelector(window.location.hash); } catch (e) { return; }
    if (!el) return;
    let p = el;
    while (p) {
      if (p.tagName === "DETAILS") p.open = true;
      p = p.parentElement;
    }
    setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
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

  // Plain text from stored HTML, for searching and snippets.
  function plainText(html) {
    return stripTags(html);
  }

  // Wraps matches of `term` in <mark>, escaping everything else first so the
  // snippet can never inject markup from the source content.
  function highlight(text, term) {
    const safe = escapeHtml(text);
    if (!term) return safe;
    const escTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      return safe.replace(new RegExp(escTerm, "gi"), (m) => `<mark>${m}</mark>`);
    } catch (e) {
      return safe;
    }
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


  // A real centred confirmation, rather than an inline two-click arm. Deleting
  // several thousand words of dictated thinking deserves an explicit, readable
  // "this is what you're about to lose" moment.
  function confirmDestructive(opts) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "dk-modal-overlay";
      overlay.innerHTML =
        `<div class="dk-confirm" role="alertdialog" aria-modal="true" aria-label="${opts.title}">` +
          `<div class="dkc-title">${opts.title}</div>` +
          (opts.body ? `<div class="dkc-body">${opts.body}</div>` : "") +
          (opts.preview ? `<div class="dkc-preview">${opts.preview}</div>` : "") +
          `<div class="dkc-actions">` +
            `<button class="dkc-btn" data-act="cancel" type="button">Cancel</button>` +
            `<button class="dkc-btn danger" data-act="ok" type="button">${opts.confirmLabel || "Delete"}</button>` +
          `</div>` +
        `</div>`;
      document.body.appendChild(overlay);

      function finish(result) {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        resolve(result);
      }
      function onKey(e) {
        if (e.key === "Escape") finish(false);
        if (e.key === "Enter") finish(true);
      }
      document.addEventListener("keydown", onKey);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) finish(false);
        const act = e.target.dataset && e.target.dataset.act;
        if (act === "cancel") finish(false);
        if (act === "ok") finish(true);
      });
      const cancel = overlay.querySelector('[data-act="cancel"]');
      if (cancel) cancel.focus();
    });
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
    const grouped = opts.grouped !== false;
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

    function buildCard(c) {
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
        return card;
    }

    // Flat lists of several hundred questions are unnavigable, so cards are
    // grouped into disclosure blocks: by topic then node on the global deck,
    // by node alone inside a topic pack. Groups open on demand — except when a
    // filter is active, where hiding matches behind closed blocks would defeat
    // the point of filtering.
    function groupKeyOf(c) {
      return c.t || (c.c ? String(c.c).replace(/-/g, " ") : "Other");
    }

    function makeGroup(title, count, openIt) {
      const d = document.createElement("details");
      d.className = "node-block deck-group";
      if (openIt) d.open = true;
      d.innerHTML =
        `<summary class="node-summary">` +
          `<span class="node-chevron">${ICON.chevron}</span>` +
          `<span class="node-title">${title}</span>` +
          `<span class="node-count">${count}</span>` +
        `</summary>`;
      const body = document.createElement("div");
      body.className = "node-body";
      d.appendChild(body);
      return { block: d, body };
    }

    function drawCards() {
      listEl.innerHTML = "";
      const shown = cards.filter(passesFilter);
      if (!shown.length) {
        listEl.innerHTML = "<p class='empty-note'>no questions match this filter</p>";
        return;
      }
      if (!grouped) {
        shown.forEach((c) => listEl.appendChild(buildCard(c)));
        return;
      }

      const filtering = activeFilter !== "all" || !!textFilter;

      function renderNodeGroups(parentEl, list) {
        const byNode = new Map();
        list.forEach((c) => {
          const k = groupKeyOf(c);
          if (!byNode.has(k)) byNode.set(k, []);
          byNode.get(k).push(c);
        });
        byNode.forEach((items, name) => {
          const g = makeGroup(name, items.length, filtering);
          items.forEach((c) => g.body.appendChild(buildCard(c)));
          addBlockFooter(g.block, "Collapse");
          parentEl.appendChild(g.block);
        });
      }

      if (showTopic) {
        const byTopic = new Map();
        shown.forEach((c) => {
          const k = topicOf(c);
          if (!byTopic.has(k)) byTopic.set(k, []);
          byTopic.get(k).push(c);
        });
        // Open the topic level on arrival so the page shows its structure —
        // the node groups — rather than two or three bare bars that read as an
        // empty page. The node groups below stay closed, so this reveals
        // navigation without dumping several hundred cards.
        const openTopics = filtering || byTopic.size <= 6;
        byTopic.forEach((items, topic) => {
          const g = makeGroup(topic.replace(/-/g, " "), items.length, openTopics);
          g.block.classList.add("topic-group");
          renderNodeGroups(g.body, items);
          addBlockFooter(g.block, "Collapse this topic");
          listEl.appendChild(g.block);
        });
      } else {
        renderNodeGroups(listEl, shown);
      }
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

        // Header carries identity only. Actions live at the bottom right of the
        // editor, where a writer's hands and eyes already are once they finish
        // typing — the same place a chat composer puts its send button.
        const meta = document.createElement("div");
        meta.className = "nt-meta";
        const ts = document.createElement("span");
        ts.className = "nt-ts";
        ts.textContent = formatNoteTime(note.ts);
        const status = document.createElement("span");
        status.className = "nt-status";
        meta.appendChild(ts);
        meta.appendChild(status);

        const actions = document.createElement("div");
        actions.className = "nt-actions";
        const del = document.createElement("button");
        del.className = "nt-del";
        del.type = "button";
        del.innerHTML = ICON.trash;
        del.title = "Delete this follow-up";
        del.setAttribute("aria-label", "Delete this follow-up");
        const doneBtn = document.createElement("button");
        doneBtn.className = "nt-done";
        doneBtn.type = "button";
        doneBtn.innerHTML = ICON.done + "<span>Done</span>";
        doneBtn.title = "Save and collapse this follow-up";
        actions.appendChild(del);
        actions.appendChild(doneBtn);

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
        item.appendChild(actions);
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

        del.addEventListener("click", async (e) => {
          e.stopPropagation();
          const words = (note.text || "").trim().split(/\s+/).filter(Boolean).length;
          const ok = await confirmDestructive({
            title: "Delete this follow-up?",
            body:
              `Written ${formatNoteTime(note.ts)} — about ${words.toLocaleString()} word${words === 1 ? "" : "s"}. ` +
              "This can't be undone from here; only a backup could bring it back.",
            preview: escapeHtml(summarise(note.text)),
            confirmLabel: "Delete follow-up",
          });
          if (!ok) return;
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


  // ---------- Read-aloud reader ----------
  // An in-page player built on the Web Speech API, mounted automatically on
  // every page that already loads this file. Nothing is added to the pages
  // themselves: the module finds its own scopes in the DOM at run time.
  //
  // Three things make this harder than "speak the body text":
  //   1. Content arrives by fetch *after* load, so nothing may be collected
  //      until play time (and it must be re-collected whenever it changes).
  //   2. Four tabs coexist in the DOM, three of them display:none.
  //   3. The pages are full of chrome — marker buttons, filter bars, copy
  //      buttons, collapse footers — that must never be narrated. The unit
  //      collector is therefore strictly opt-in: only known content elements
  //      inside known content containers are read. Unrecognised markup is
  //      skipped, never guessed at.
  const reader = (() => {
    const KEY_MARKS = "dk-reader-marks-v1";
    const KEY_VOICE = "dk-reader-voice";
    const KEY_RATE = "dk-reader-rate";
    const KEY_PITCH = "dk-reader-pitch";
    const KEY_CODE = "dk-reader-code";
    const KEY_ANSWERS = "dk-reader-answers";

    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    const hasSpeech = !!(synth && typeof window.SpeechSynthesisUtterance === "function");
    const hasHighlight = !!(window.CSS && CSS.highlights && typeof window.Highlight === "function");

    // ----- readable-content contract -----------------------------------
    // Containers we are willing to descend through. An element only becomes a
    // readable unit if every ancestor between it and the scope root is one of
    // these, which is what keeps chrome out without a list of exclusions.
    const CONTAINERS = [
      ".prose", ".node-body", ".card-list", ".rc-card", ".el-card",
      "details.node-block", "details.sub-block", "details.el-block", "details.deck-group",
      "summary.node-summary", "ul", "ol", "blockquote", "table", "thead", "tbody",
      "tfoot", "tr", "dl", "section", "article", "figure",
    ].join(",");

    // The elements that are read. `.node-title` carries the section heading;
    // `.q` / `.a` are deck-card question and answer.
    const UNITS = [
      "summary.node-summary > .node-title",
      "p", "li", "h4", "h5", "h6", "dt", "dd", "th", "td", "figcaption",
      ".rc-card > .q", ".rc-card > .a", ".el-card > .q", ".el-card > .a",
    ].join(",");

    // Never read, never descended into, even if something above would allow it.
    const DENY = [
      ".prose-controls", ".node-local", ".node-foot", ".mark-filter", ".mk-row",
      ".nt-list", ".nt-item", ".topic-tag", ".empty-note", ".dk-reader",
      ".dkr-inline", ".code-copy", "button", "textarea", "input", "select", "svg",
      "script", "style",
    ].join(",");

    const state = {
      status: "idle",          // idle | playing | paused
      units: [],               // flat list of sentences for the playing scope
      idx: 0,
      scope: null,             // id of the scope that owns the audio
      gen: 0,                  // bumped whenever current speech is abandoned
      charOffset: 0,           // where in the sentence the current utterance began
      lastChar: 0,             // last word boundary seen, sentence-relative
      lastEvent: 0,
      retries: 0,
      open: false,             // player bar visible
      locked: false,
    };

    let ui = null;
    let voices = [];
    let watchdog = null;
    let hlSentence = null;
    let hlWord = null;
    let lockBtn = null;
    let keepAlive = null;        // silent track that owns the media session
    let keepAliveUrl = null;
    let lastCard = null;
    let lastCardAt = 0;
    let lastCardIdx = -1;
    let cardTimer = null;
    let sheetOpen = false;
    let follow = true;           // does the lyric list track the narration
    let lineEls = [];
    let detailsSnapshot = null;

    // ----- small helpers ------------------------------------------------
    function readJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    }
    function writeJSON(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota, private mode */ }
    }
    function pref(key, fallback) {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    }
    function setPref(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }
    function rate() { return parseFloat(pref(KEY_RATE, "1")) || 1; }
    function pitch() { return parseFloat(pref(KEY_PITCH, "1")) || 1; }
    function readCode() { return pref(KEY_CODE, "0") === "1"; }
    function readAnswers() { return pref(KEY_ANSWERS, "0") === "1"; }

    function marks() { return readJSON(KEY_MARKS, {}); }
    function getBookmark(id) { return marks()[id] || null; }
    function setBookmark(id, idx, total) {
      if (!id) return;
      const all = marks();
      all[id] = { i: idx, total: total, ts: Date.now() };
      writeJSON(KEY_MARKS, all);
    }

    // ----- scopes -------------------------------------------------------
    // A scope is one independently bookmarked body of text, keyed `topic:tab`.
    function topicSlug() {
      const m = window.location.pathname.match(/topics\/([^/]+)\//);
      if (m) return m[1];
      const file = window.location.pathname.split("/").pop() || "index.html";
      return file.replace(/\.html?$/, "") || "index";
    }

    function scopes() {
      const out = [];
      const topic = topicSlug();
      const tabs = [
        ["landscape", "Landscape"],
        ["recall", "Recall"],
        ["prep", "Prep"],
        ["elaboration", "Elaboration"],
      ];
      let sawTab = false;
      tabs.forEach(([tab, label]) => {
        const root = document.getElementById("tab-" + tab);
        if (!root) return;
        sawTab = true;
        out.push({ id: `${topic}:${tab}`, tab, root, label, topic });
      });
      if (sawTab) return out;

      // Pages outside a topic pack (the global deck, search) have one body of
      // content and a page intro. The scope is the content container itself,
      // not the whole .wrap, so the page lede and heading stay unspoken.
      const wrap = document.querySelector(".wrap");
      if (wrap) {
        const bodies = wrap.querySelectorAll(".card-list, .prose");
        const root = bodies.length === 1 ? bodies[0] : (bodies.length ? wrap : null);
        if (root) {
          out.push({ id: `${topic}:main`, tab: null, root, label: document.title.split("—")[0].trim() || topic, topic });
        }
      }
      return out;
    }

    function isVisible(el) {
      return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }

    // The scope the user is currently looking at — the visible tab.
    function viewedScope() {
      const all = scopes();
      return all.find((s) => isVisible(s.root)) || all[0] || null;
    }

    function scopeById(id) {
      return scopes().find((s) => s.id === id) || null;
    }

    // ----- unit collection ----------------------------------------------
    function allowedChain(el, root) {
      let p = el.parentElement;
      while (p && p !== root) {
        if (p.matches(DENY)) return false;
        if (!p.matches(CONTAINERS)) return false;
        p = p.parentElement;
      }
      return p === root;
    }

    // Flattens one element into a text string plus the map of text nodes that
    // produced it, so any character range can later be turned back into a DOM
    // Range for highlighting — no span wrapping, no DOM mutation.
    function textMapOf(el, allowPre) {
      const pieces = [];
      let text = "";
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches(DENY)) return NodeFilter.FILTER_REJECT;
            if (!allowPre && (node.tagName === "PRE" || node.classList.contains("code-wrap"))) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let node = walker.nextNode();
      while (node) {
        const raw = node.nodeValue || "";
        if (raw) {
          pieces.push({ node, start: text.length, end: text.length + raw.length });
          text += raw;
        }
        node = walker.nextNode();
      }
      return { text, pieces };
    }

    // Sentence splitting, with the abbreviations that otherwise chop a
    // sentence in half mid-thought. Chromium truncates utterances past roughly
    // fifteen seconds, so anything long is chunked further at word boundaries.
    const ABBREV = /(?:^|\s)(?:e\.g|i\.e|etc|vs|approx|fig|no|dr|mr|mrs|ms|prof|st|jr|sr|al)\.$/i;
    const MAX_CHUNK = 220;

    function splitSentences(text) {
      const spans = [];
      let start = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
        let j = i;
        while (j + 1 < text.length && /[.!?…"')\]”’]/.test(text[j + 1])) j++;
        const next = text[j + 1];
        if (next !== undefined && !/\s/.test(next)) continue;
        const head = text.slice(start, i + 1);
        if (ABBREV.test(head)) { i = j; continue; }
        // A single digit before a period is usually a numbered list, not an end.
        if (ch === "." && /(?:^|\s)\d+$/.test(text.slice(start, i))) { i = j; continue; }
        spans.push([start, j + 1]);
        start = j + 1;
        i = j;
      }
      if (start < text.length) spans.push([start, text.length]);

      const out = [];
      spans.forEach(([s, e]) => {
        let a = s;
        while (a < e && /\s/.test(text[a])) a++;
        let b = e;
        while (b > a && /\s/.test(text[b - 1])) b--;
        if (b <= a) return;
        if (b - a <= MAX_CHUNK) { out.push([a, b]); return; }
        // Long sentence: cut at the last word boundary inside the limit.
        let cut = a;
        while (cut < b) {
          let stop = Math.min(cut + MAX_CHUNK, b);
          if (stop < b) {
            const space = text.lastIndexOf(" ", stop);
            if (space > cut + 40) stop = space;
          }
          out.push([cut, stop]);
          cut = stop;
          while (cut < b && /\s/.test(text[cut])) cut++;
        }
      });
      return out;
    }

    function hasSpeakableText(s) {
      return /[a-z0-9]/i.test(s);
    }

    // Spoken form: card numbering is UI scaffolding, not content.
    function speakable(text) {
      return text.replace(/^Q\d+\.\s*/, "").replace(/\s+/g, " ").trim();
    }

    // Builds the flat sentence list for a scope. Called at play time and on
    // every rebuild — never at load, because the content is not there yet.
    function collect(scope) {
      const root = scope.root;
      const code = readCode();
      const answers = readAnswers();
      const picked = [];
      const set = new Set();

      const candidates = Array.from(root.querySelectorAll(code ? UNITS + ",pre" : UNITS));
      candidates.forEach((el) => {
        if (el.matches(DENY)) return;
        if (el.tagName === "PRE") {
          if (!code) return;
        } else if (el.closest("pre")) {
          return;
        }
        if (el.classList.contains("a")) {
          const card = el.closest(".rc-card, .el-card");
          if (card && !answers && !card.classList.contains("revealed")) return;
        }
        // `.code-wrap` is only a legitimate container when code reading is on.
        let chainRoot = root;
        if (el.tagName === "PRE" && el.parentElement && el.parentElement.classList.contains("code-wrap")) {
          chainRoot = root;
          const wrap = el.parentElement;
          if (!allowedChain(wrap, root)) return;
        } else if (!allowedChain(el, chainRoot)) {
          return;
        }
        picked.push(el);
        set.add(el);
      });

      // Drop anything nested inside another pick (a <p> inside an <li>).
      const kept = picked.filter((el) => {
        let p = el.parentElement;
        while (p && p !== root) {
          if (set.has(p)) return false;
          p = p.parentElement;
        }
        return true;
      });

      const units = [];
      kept.forEach((el) => {
        const isPre = el.tagName === "PRE";
        const map = textMapOf(el, isPre);
        const clean = speakable(map.text);
        if (!clean || !hasSpeakableText(clean)) return;
        const offset = map.text.length - map.text.replace(/^Q\d+\.\s*/, "").length;
        splitSentences(map.text.slice(offset)).forEach(([s, e]) => {
          const text = map.text.slice(offset + s, offset + e).replace(/\s+/g, " ").trim();
          if (!text || !hasSpeakableText(text)) return;
          units.push({ el, map, s: offset + s, e: offset + e, text, words: text.split(/\s+/).length });
        });
      });
      return units;
    }

    // ----- highlighting --------------------------------------------------
    function initHighlights() {
      if (!hasHighlight || hlSentence) return;
      hlSentence = new Highlight();
      hlWord = new Highlight();
      CSS.highlights.set("dk-read-sentence", hlSentence);
      CSS.highlights.set("dk-read-word", hlWord);
    }

    function rangeFor(unit, from, to) {
      const pieces = unit.map.pieces;
      let startNode = null, startOff = 0, endNode = null, endOff = 0;
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        if (!startNode && from >= p.start && from < p.end) { startNode = p.node; startOff = from - p.start; }
        if (to > p.start && to <= p.end) { endNode = p.node; endOff = to - p.start; }
      }
      if (!startNode || !endNode) return null;
      try {
        const r = document.createRange();
        r.setStart(startNode, startOff);
        r.setEnd(endNode, endOff);
        return r;
      } catch (e) {
        return null;
      }
    }

    function paintSentence(unit) {
      if (!hasHighlight) return;
      initHighlights();
      hlSentence.clear();
      hlWord.clear();
      const r = rangeFor(unit, unit.s, unit.e);
      if (r) hlSentence.add(r);
    }

    function paintWord(unit, charIndex, length) {
      if (!hasHighlight || !hlWord) return;
      hlWord.clear();
      const raw = unit.map.text;
      let from = unit.s + charIndex;
      if (from >= unit.e) return;
      let to = length ? from + length : from;
      if (!length) {
        while (to < unit.e && !/\s/.test(raw[to])) to++;
      }
      to = Math.min(to, unit.e);
      const r = rangeFor(unit, from, to);
      if (r) hlWord.add(r);
    }

    function clearHighlights() {
      if (hlSentence) hlSentence.clear();
      if (hlWord) hlWord.clear();
    }

    // ----- <details> state ------------------------------------------------
    // Force open what we need to show, remember everything, put it all back on
    // stop — including whatever "Expand all" had already done.
    function snapshotDetails(scope) {
      detailsSnapshot = Array.from(scope.root.querySelectorAll("details")).map((d) => ({ el: d, open: d.open }));
    }

    function restoreDetails() {
      if (!detailsSnapshot) return;
      detailsSnapshot.forEach(({ el, open }) => {
        if (el.isConnected) el.open = open;
      });
      detailsSnapshot = null;
    }

    function revealUnit(unit) {
      let p = unit.el.parentElement;
      while (p) {
        if (p.tagName === "DETAILS" && !p.open) p.open = true;
        p = p.parentElement;
      }
    }

    function scrollToUnit(unit) {
      const rect = unit.el.getBoundingClientRect();
      const margin = 120;
      if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
        unit.el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    // ----- voices ---------------------------------------------------------
    // getVoices() is empty on the first synchronous call; the list only exists
    // once the engine fires voiceschanged.
    function loadVoices() {
      if (!hasSpeech) return;
      const all = synth.getVoices() || [];
      voices = all.filter((v) => /^en(-|_|$)/i.test(v.lang || ""));
      if (!voices.length) voices = all.slice();
      voices.sort((a, b) => {
        const na = naturalRank(a), nb = naturalRank(b);
        if (na !== nb) return na - nb;
        return (a.name || "").localeCompare(b.name || "");
      });
      if (ui) drawVoices();
    }

    function naturalRank(v) {
      const n = (v.name || "").toLowerCase();
      if (n.includes("natural")) return 0;
      if (n.includes("online")) return 1;
      return 2;
    }

    function currentVoice() {
      // .name is already the full display string — nothing is reconstructed
      // from other properties, which is what produced "undefined" labels before.
      const want = pref(KEY_VOICE, "");
      if (want) {
        const hit = voices.find((v) => v.name === want);
        if (hit) return hit;
      }
      return voices[0] || null;
    }

    // ----- engine ---------------------------------------------------------
    // Nothing here consults synth.speaking or synth.paused: both lie in
    // Chromium. All state comes from utterance events and this state machine.
    function makeUtterance(text) {
      const u = new SpeechSynthesisUtterance(text);
      const v = currentVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = rate();
      u.pitch = pitch();
      return u;
    }

    // Every speak() is routed through here: speak() called synchronously after
    // cancel() is dropped silently by Chromium, so the engine is given a beat
    // to settle, and any stale callback is discarded by generation.
    function safeSpeak(text, myGen) {
      try { synth.cancel(); } catch (e) { /* ignore */ }
      setTimeout(() => {
        if (myGen !== state.gen || state.status !== "playing") return;
        const u = makeUtterance(text);
        u.onstart = () => { if (myGen === state.gen) state.lastEvent = Date.now(); };
        u.onboundary = (ev) => {
          if (myGen !== state.gen) return;
          state.lastEvent = Date.now();
          if (typeof ev.charIndex !== "number") return;
          state.lastChar = state.charOffset + ev.charIndex;
          state.retries = 0;
          paintWord(state.units[state.idx], state.lastChar, ev.charLength || 0);
          paintSpokenWords();
        };
        u.onend = () => {
          if (myGen !== state.gen) return;
          state.lastEvent = Date.now();
          advance(1);
        };
        u.onerror = (ev) => {
          if (myGen !== state.gen) return;
          if (ev && (ev.error === "interrupted" || ev.error === "canceled")) return;
          state.lastEvent = Date.now();
          advance(1);
        };
        try { synth.speak(u); } catch (e) { advance(1); }
      }, 90);
    }

    function speakFrom(idx, charOffset) {
      const unit = state.units[idx];
      if (!unit) { finish(); return; }
      state.idx = idx;
      state.charOffset = charOffset || 0;
      state.lastChar = state.charOffset;
      state.retries = state.retries || 0;
      state.lastEvent = Date.now();
      const scope = scopeById(state.scope);
      if (scope) setBookmark(scope.id, idx, state.units.length);
      revealUnit(unit);
      paintSentence(unit);
      if (scope && viewedScope() && viewedScope().id === scope.id) scrollToUnit(unit);
      setMediaMetadata(unit);
      const text = unit.text.slice(state.charOffset - unit.s < 0 ? 0 : state.charOffset - unit.s);
      safeSpeak(text || unit.text, ++state.gen);
      draw();
      paintLines();
    }

    function advance(step) {
      const next = state.idx + step;
      if (next < 0) { speakFrom(0, 0); return; }
      if (next >= state.units.length) { finish(); return; }
      state.retries = 0;
      speakFrom(next, 0);
    }

    function finish() {
      const scope = scopeById(state.scope);
      if (scope) setBookmark(scope.id, 0, state.units.length);
      stop();
    }

    // Bounded watchdog: Chromium sometimes drops an utterance outright, with
    // no end and no error, which is what produced "progress moves, audio is
    // silent". Two retries from the last spoken word, then move on.
    function startWatchdog() {
      stopWatchdog();
      watchdog = setInterval(() => {
        if (state.status !== "playing") return;
        const unit = state.units[state.idx];
        if (!unit) return;
        const spoken = Math.max(0, state.lastChar - unit.s);
        const remaining = Math.max(0, unit.text.length - spoken);
        // Roughly fifteen characters a second at 1×, plus three seconds of
        // slack: engines that never fire a boundary event still get the whole
        // sentence's worth of time before they are declared stalled.
        const limit = 3000 + (remaining / Math.max(0.5, rate())) * 70;
        if (Date.now() - state.lastEvent < limit) return;
        if (state.retries >= 2) {
          state.retries = 0;
          advance(1);
          return;
        }
        state.retries++;
        state.lastEvent = Date.now();
        resumeFromWord();
      }, 1500);
    }

    function stopWatchdog() {
      if (watchdog) { clearInterval(watchdog); watchdog = null; }
    }

    // Resume re-speaks from the last word boundary the engine reported — never
    // mid-word, and never by trusting resume(), which strands the engine.
    function resumeFromWord() {
      const unit = state.units[state.idx];
      if (!unit) return;
      let from = Math.max(unit.s, Math.min(state.lastChar, unit.e));
      const raw = unit.map.text;
      while (from > unit.s && !/\s/.test(raw[from - 1])) from--;
      speakFrom(state.idx, from);
    }

    // ----- background playback -------------------------------------------
    // speechSynthesis is not media playback as far as the browser is
    // concerned: on its own it puts nothing in the notification shade, and a
    // backgrounded tab with no audio gets frozen, which is what stops the
    // narration the moment you press Home. An <audio> element that is actually
    // playing fixes both — it makes the page an audible media player, so the
    // tab keeps running and the media session has something to attach to.
    //
    // The track is generated here rather than shipped as a file: 16-bit PCM at
    // ±2/32768, which is -84 dBFS. Inaudible, but not digital silence, which
    // some engines discard as "not really playing".
    //
    // Thirty seconds, and the length is the whole point. Chromium only makes a
    // player *controllable* — notification, lock screen, MediaSession action
    // routing — once it has audio, is unmuted, and runs at least five seconds.
    // A four-second loop kept the tab alive and kept speaking in the
    // background, which is why that part worked, while never earning any
    // controls. Well clear of the threshold now.
    function silentTrackUrl() {
      if (keepAliveUrl) return keepAliveUrl;
      const hz = 8000, secs = 30, n = hz * secs;
      const buf = new ArrayBuffer(44 + n * 2);
      const dv = new DataView(buf);
      const str = (off, text) => {
        for (let i = 0; i < text.length; i++) dv.setUint8(off + i, text.charCodeAt(i));
      };
      str(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt ");
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, hz, true); dv.setUint32(28, hz * 2, true);
      dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
      str(36, "data"); dv.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, i % 2 ? 2 : -2, true);
      try {
        keepAliveUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
      } catch (e) {
        keepAliveUrl = "";
      }
      if (!keepAliveUrl) {
        // No object URLs here: inline it instead, which needs no lifetime
        // management at all.
        try {
          const bytes = new Uint8Array(buf);
          let bin = "";
          for (let i = 0; i < bytes.length; i += 4096) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
          }
          keepAliveUrl = "data:audio/wav;base64," + btoa(bin);
        } catch (e2) {
          keepAliveUrl = "";
        }
      }
      return keepAliveUrl;
    }

    function startKeepAlive() {
      if (!keepAlive) {
        const url = silentTrackUrl();
        if (!url) return;
        try {
          keepAlive = new Audio(url);
          keepAlive.loop = true;
          keepAlive.preload = "auto";
          // A muted or zero-volume element is not a controllable player either.
          keepAlive.muted = false;
          keepAlive.volume = 1;
          keepAlive.setAttribute("aria-hidden", "true");
        } catch (e) {
          keepAlive = null;
          return;
        }
      }
      // Started from the play button, so this is inside a user gesture.
      try {
        const p = keepAlive.play();
        if (p && p.catch) p.catch(() => { /* autoplay policy; controls still work */ });
      } catch (e) { /* nothing else to try */ }
    }

    // Paused rather than torn down: the notification should stay on screen with
    // a play button on it, the way a paused song does.
    function pauseKeepAlive() {
      if (keepAlive) { try { keepAlive.pause(); } catch (e) { /* ignore */ } }
    }

    function stopKeepAlive() {
      if (!keepAlive) return;
      try { keepAlive.pause(); keepAlive.currentTime = 0; } catch (e) { /* ignore */ }
    }

    // ----- the lock-screen card ------------------------------------------
    // Android draws the lock screen itself, from the media session: title,
    // artist, artwork, position, and a few actions. A page cannot put its own
    // scrollable view there — that surface belongs to the OS, and has since
    // lock-screen widgets were removed in Android 5.
    //
    // The artwork, though, is ours, and it is redrawn every sentence. So the
    // card carries the transcript: the sentence being narrated, large, with the
    // one before and the one after dimmed around it for context, over the
    // topic and a progress bar. Not scrollable — nothing on that surface can
    // be — but it is the reading position, legible at a glance, on the lock
    // screen. Scrolling and jumping stay in the in-page transcript.

    // Greedy wrap against real glyph widths, so long words and short ones both
    // land correctly whatever the font resolves to.
    function wrapLines(g, text, maxWidth, maxLines) {
      const words = String(text || "").split(/\s+/).filter(Boolean);
      const lines = [];
      let line = "";
      for (let i = 0; i < words.length; i++) {
        const next = line ? line + " " + words[i] : words[i];
        if (g.measureText(next).width <= maxWidth || !line) {
          line = next;
        } else {
          lines.push(line);
          line = words[i];
          if (lines.length === maxLines) break;
        }
      }
      if (lines.length < maxLines && line) lines.push(line);
      if (lines.length === maxLines && words.length) {
        // Ellipsise the last line if there was more to say.
        const joined = lines.join(" ");
        if (joined.replace(/\s+/g, " ") !== words.join(" ")) {
          let last = lines[maxLines - 1];
          while (last && g.measureText(last + "…").width > maxWidth) {
            last = last.slice(0, -1);
          }
          lines[maxLines - 1] = last + "…";
        }
      }
      return lines;
    }

    function drawCard(unit) {
      const scope = scopeById(state.scope);
      const cvs = document.createElement("canvas");
      cvs.width = 512; cvs.height = 512;
      const g = cvs.getContext("2d");
      if (!g) return null;

      const css = getComputedStyle(document.documentElement);
      const varOf = (name, fallback) => (css.getPropertyValue(name) || "").trim() || fallback;
      const bg = varOf("--panel", "#0e1520");
      const accent = varOf("--accent", "#f0b45f");
      const strong = varOf("--text-strong", "#e2eaf5");
      const dim = varOf("--text-dimmer", "#5b6a80");
      const border = varOf("--border", "#223047");

      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 512);

      // Header: where this is coming from.
      g.fillStyle = accent;
      g.fillRect(40, 40, 40, 4);
      g.font = "500 20px ui-monospace, monospace";
      g.fillText(scope ? scope.label.toLowerCase() : "read aloud", 40, 80);
      g.fillStyle = dim;
      g.font = "400 20px ui-monospace, monospace";
      g.fillText(scope ? scope.topic.replace(/-/g, " ") : "devxkapoor", 40, 108);

      const width = 432;
      const prev = state.units[state.idx - 1];
      const next = state.units[state.idx + 1];

      // The sentence before, dimmed — the same context the in-page transcript
      // gives you above the live line.
      if (prev) {
        g.fillStyle = dim;
        g.font = "400 21px system-ui, sans-serif";
        wrapLines(g, prev.text, width, 2).forEach((ln, i) => g.fillText(ln, 40, 158 + i * 27));
      }

      // The sentence being narrated. Five lines is what fits above the
      // progress bar at this size; anything longer is ellipsised rather than
      // running off the card.
      g.fillStyle = strong;
      g.font = "600 30px system-ui, sans-serif";
      const cur = wrapLines(g, unit ? unit.text : "", width, 5);
      cur.forEach((ln, i) => g.fillText(ln, 40, 240 + i * 38));

      // The sentence after, but only while it genuinely fits: a long current
      // sentence takes the space, and context is what gives way.
      const nextTop = 240 + cur.length * 38 + 20;
      if (next && nextTop + 27 <= 440) {
        g.fillStyle = dim;
        g.font = "400 21px system-ui, sans-serif";
        const room = nextTop + 54 <= 440 ? 2 : 1;
        wrapLines(g, next.text, width, room).forEach((ln, i) => g.fillText(ln, 40, nextTop + i * 27));
      }

      // Position, matching the player's own progress bar.
      const total = state.units.length || 1;
      const done = Math.min(state.idx + 1, total);
      g.fillStyle = border;
      g.fillRect(40, 462, width, 4);
      g.fillStyle = accent;
      g.fillRect(40, 462, Math.max(4, (width * done) / total), 4);
      g.fillStyle = dim;
      g.font = "400 17px ui-monospace, monospace";
      g.fillText(`${done} / ${total}`, 40, 494);

      return cvs.toDataURL("image/png");
    }

    // Redrawing on every sentence is the point, but a run of very short ones
    // should not become a stream of PNG encodes. At most one card every 400ms
    // — and when a redraw is skipped it is *scheduled*, never dropped, so the
    // card can never sit showing a sentence that has already been read.
    function cardFor(unit) {
      const now = Date.now();
      const wait = 400 - (now - lastCardAt);
      if (lastCard && lastCardIdx !== state.idx && wait > 0) {
        clearTimeout(cardTimer);
        cardTimer = setTimeout(() => {
          if (state.status === "idle") return;
          setMediaMetadata(state.units[state.idx]);
        }, wait + 20);
        return lastCard;
      }
      if (lastCard && lastCardIdx === state.idx) return lastCard;
      try {
        const url = drawCard(unit);
        if (url) { lastCard = url; lastCardAt = now; lastCardIdx = state.idx; }
        return lastCard;
      } catch (e) {
        return lastCard;
      }
    }

    // Title is the sentence being narrated, so the notification and the lock
    // screen say what is actually being read, not just which page it came from.
    function setMediaMetadata(unit) {
      if (!("mediaSession" in navigator) || typeof window.MediaMetadata !== "function") return;
      const scope = scopeById(state.scope);
      try {
        const art = cardFor(unit);
        navigator.mediaSession.metadata = new MediaMetadata({
          title: unit.text.slice(0, 160),
          artist: scope ? `${scope.topic.replace(/-/g, " ")} · ${scope.label.toLowerCase()}` : "devxkapoor",
          album: "devxkapoor / mastery-track",
          artwork: art
            ? [96, 192, 256, 512].map((n) => ({ src: art, sizes: `${n}x${n}`, type: "image/png" }))
            : [],
        });
        navigator.mediaSession.playbackState = state.status === "playing" ? "playing" : "paused";
      } catch (e) { /* metadata is a nicety */ }
      setPositionState();
    }

    // Feeds the notification's scrub bar. The numbers are the same word-count
    // estimate the player bar shows — honest to about a sentence.
    function setPositionState() {
      if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
      const total = secondsFor(state.units, 0, state.units.length);
      if (!isFinite(total) || total <= 0) return;
      const at = Math.min(secondsFor(state.units, 0, state.idx), total);
      try {
        navigator.mediaSession.setPositionState({
          duration: total,
          position: Math.max(0, at),
          playbackRate: 1,
        });
      } catch (e) { /* some engines reject rapid updates */ }
    }

    function wireMediaSession() {
      if (!("mediaSession" in navigator)) return;
      const set = (action, fn) => {
        try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) { /* unsupported */ }
      };
      set("play", () => { if (state.status === "paused") resume(); else if (state.status === "idle") toggle(); });
      set("pause", () => pause());
      set("stop", () => stop());
      set("previoustrack", () => seek(-1));
      set("nexttrack", () => seek(1));
      set("seekbackward", () => seek(-1));
      set("seekforward", () => seek(1));
      set("seekto", (ev) => {
        const total = secondsFor(state.units, 0, state.units.length);
        if (!ev || typeof ev.seekTime !== "number" || total <= 0) return;
        seekTo(Math.round((ev.seekTime / total) * (state.units.length - 1)));
      });
    }

    // ----- public playback ------------------------------------------------
    function rebuild() {
      const scope = scopeById(state.scope);
      if (!scope) return;
      state.units = collect(scope);
    }

    // Loads a scope and places the cursor at its bookmark without speaking, so
    // the transcript can be opened and browsed before anything is playing.
    function prepare(scopeId) {
      const scope = scopeById(scopeId);
      if (!scope || state.status !== "idle") return !!scope;
      state.scope = scope.id;
      state.units = collect(scope);
      const bm = getBookmark(scope.id);
      state.idx = bm && typeof bm.i === "number" && bm.i < state.units.length ? bm.i : 0;
      return true;
    }

    function playScope(scopeId, opts) {
      if (!hasSpeech) return;
      const o = opts || {};
      const scope = scopeById(scopeId);
      if (!scope) return;

      // Play is a takeover: bookmark whatever is speaking, then switch.
      if (state.scope && state.scope !== scope.id && state.status !== "idle") {
        setBookmark(state.scope, state.idx, state.units.length);
        hardStop(false);
      } else if (state.status !== "idle") {
        hardStop(false);
      }

      state.scope = scope.id;
      state.units = collect(scope);
      if (!state.units.length) {
        openPlayer();
        setNote("Nothing readable on this tab yet.");
        return;
      }

      let start = 0;
      if (typeof o.index === "number") {
        start = Math.max(0, Math.min(o.index, state.units.length - 1));
      } else if (o.element) {
        const hit = state.units.findIndex((u) => o.element.contains(u.el));
        start = hit >= 0 ? hit : 0;
      } else {
        const bm = getBookmark(scope.id);
        if (bm && typeof bm.i === "number" && bm.i < state.units.length) start = bm.i;
      }

      snapshotDetails(scope);
      state.status = "playing";
      state.retries = 0;
      openPlayer();
      if (sheetOpen) renderLines();
      startKeepAlive();
      startWatchdog();
      speakFrom(start, 0);
    }

    function pause() {
      if (state.status !== "playing") return;
      // pause() is unreliable in Chromium — cancel and remember instead.
      state.gen++;
      try { synth.cancel(); } catch (e) { /* ignore */ }
      state.status = "paused";
      stopWatchdog();
      pauseKeepAlive();
      if (state.scope) setBookmark(state.scope, state.idx, state.units.length);
      if (hlWord) hlWord.clear();
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
      draw();
    }

    function resume() {
      if (state.status !== "paused") return;
      if (!state.units.length) rebuild();
      state.status = "playing";
      state.retries = 0;
      startKeepAlive();
      startWatchdog();
      resumeFromWord();
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    }

    function toggle() {
      if (state.status === "playing") { pause(); return; }
      if (state.status === "paused") { resume(); return; }
      const scope = viewedScope();
      if (scope) playScope(scope.id);
    }

    function seek(step) {
      if (state.status === "idle") return;
      const next = Math.max(0, Math.min(state.idx + step, state.units.length - 1));
      state.retries = 0;
      if (state.status === "paused") {
        state.idx = next;
        state.lastChar = state.units[next].s;
        state.charOffset = state.units[next].s;
        revealUnit(state.units[next]);
        paintSentence(state.units[next]);
        scrollToUnit(state.units[next]);
        draw();
        return;
      }
      speakFrom(next, 0);
    }

    function seekTo(index) {
      if (state.status === "idle") return;
      const next = Math.max(0, Math.min(index, state.units.length - 1));
      state.retries = 0;
      if (state.status === "paused") { state.idx = next; draw(); return; }
      speakFrom(next, 0);
    }

    function hardStop(restore) {
      state.gen++;
      stopWatchdog();
      stopKeepAlive();
      clearTimeout(cardTimer);
      try { synth.cancel(); } catch (e) { /* ignore */ }
      clearHighlights();
      if (restore !== false) restoreDetails();
      else detailsSnapshot = null;
      state.status = "idle";
    }

    function stop() {
      if (state.scope && state.units.length) setBookmark(state.scope, state.idx, state.units.length);
      hardStop(true);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
      draw();
    }

    // ----- lock ------------------------------------------------------------
    // The Edge Read-Aloud Lock equivalent: expand everything in view and stop
    // clicks from collapsing it again. Works with no Speech API at all.
    function setLocked(on) {
      state.locked = !!on;
      document.documentElement.classList.toggle("dk-locked", state.locked);
      if (state.locked) {
        const scope = viewedScope();
        const root = scope ? scope.root : document;
        root.querySelectorAll("details").forEach((d) => { d.open = true; });
      }
      if (lockBtn) {
        lockBtn.classList.toggle("on", state.locked);
        lockBtn.setAttribute("aria-pressed", state.locked ? "true" : "false");
        lockBtn.title = state.locked ? "Unfreeze sections" : "Expand everything and freeze it open";
      }
    }

    function guardLock(e) {
      if (!state.locked) return;
      const hit = e.target.closest && e.target.closest("summary, .node-foot, .pc-btn[data-act='collapse']");
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
    }

    // ----- UI ---------------------------------------------------------------
    const ICONS = {
      play: '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor"><path d="M4.5 2.8v10.4c0 .5.6.8 1 .5l8-5.2a.6.6 0 0 0 0-1L5.5 2.3a.6.6 0 0 0-1 .5z"/></svg>',
      pausing: '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor"><rect x="4" y="3" width="3.2" height="10" rx="1"/><rect x="8.8" y="3" width="3.2" height="10" rx="1"/></svg>',
      prev: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 3.5L5.5 8l5 4.5"/><path d="M4 3.5v9"/></svg>',
      next: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5L10.5 8l-5 4.5"/><path d="M12 3.5v9"/></svg>',
      stop: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/></svg>',
      gear: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2.3"/><path d="M8 1.6v1.7M8 12.7v1.7M14.4 8h-1.7M3.3 8H1.6M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2M12.5 12.5l-1.2-1.2M4.7 4.7L3.5 3.5"/></svg>',
      lock: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.6"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
      up: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4"/></svg>',
      down: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>',
      speaker: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.2h2.3L8.5 3.4v9.2L5.3 9.8H3z"/><path d="M11 5.8a3 3 0 0 1 0 4.4"/></svg>',
    };

    function fmtTime(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    }

    // Rough but honest: average English narration is ~2.7 words a second at 1×.
    function secondsFor(units, from, to) {
      let w = 0;
      for (let i = from; i < to && i < units.length; i++) w += units[i].words;
      return w / (2.7 * rate());
    }

    function buildUI() {
      const el = document.createElement("div");
      el.className = "dk-reader";
      el.hidden = true;
      // One transport markup, used twice: the bar's compact copy and the
      // sheet's large one. Both carry the same data-act values, so a single
      // delegated click handler drives either.
      const transport = (size) =>
        `<div class="dkr-transport ${size}">` +
          `<button class="dkr-btn dkr-stop" data-act="stop" type="button" aria-label="Stop">${ICONS.stop}</button>` +
          `<button class="dkr-btn dkr-step" data-act="prev" type="button" aria-label="Previous sentence">${ICONS.prev}</button>` +
          `<button class="dkr-btn dkr-primary" data-act="toggle" type="button" aria-label="Play">${ICONS.play}</button>` +
          `<button class="dkr-btn dkr-step" data-act="next" type="button" aria-label="Next sentence">${ICONS.next}</button>` +
          `<button class="dkr-btn dkr-cog" data-act="tray" type="button" aria-label="Settings">${ICONS.gear}</button>` +
        `</div>`;

      const scrubber = (cls) =>
        `<div class="dkr-scrub ${cls}">` +
          `<div class="dkr-track" role="slider" tabindex="0" aria-label="Position"><div class="dkr-fill"></div></div>` +
          `<div class="dkr-meta"><span class="dkr-time-at"></span><span class="dkr-scope"></span><span class="dkr-time-all"></span></div>` +
        `</div>`;

      el.innerHTML =
        `<button class="dkr-chip" type="button" hidden></button>` +

        `<div class="dkr-sheet" role="dialog" aria-label="Transcript" hidden>` +
          `<div class="dkr-sheet-head">` +
            `<button class="dkr-btn dkr-ghost" data-act="sheet-close" type="button" aria-label="Close transcript">${ICONS.down}</button>` +
            `<div class="dkr-sheet-title">` +
              `<strong class="dkr-sheet-topic"></strong>` +
              `<span class="dkr-sheet-tab"></span>` +
            `</div>` +
            `<span class="dkr-count"></span>` +
          `</div>` +
          `<div class="dkr-lines" tabindex="0"></div>` +
          `<button class="dkr-follow" type="button" hidden>${ICONS.down}<span>back to what's playing</span></button>` +
          `<div class="dkr-sheet-foot">` +
            scrubber("big") +
            transport("big") +
          `</div>` +
        `</div>` +

        `<div class="dkr-bar" role="region" aria-label="Read aloud player">` +
          `<div class="dkr-row">` +
            `<div class="dkr-mid">` +
              `<button class="dkr-now" data-act="sheet" type="button" aria-label="Open transcript"></button>` +
              scrubber("small") +
            `</div>` +
            `<label class="dkr-rate-wrap"><span>speed</span><select class="dkr-rate" aria-label="Speed"></select></label>` +
            transport("small") +
            `<div class="dkr-corner">` +
              `<button class="dkr-btn dkr-ghost" data-act="sheet" type="button" aria-label="Open transcript">${ICONS.up}</button>` +
              `<button class="dkr-btn dkr-ghost" data-act="close" type="button" aria-label="Close player">×</button>` +
            `</div>` +
          `</div>` +
        `</div>` +

        // The tray is a sibling of both, not a child of the bar: it has to be
        // reachable from the sheet, which covers the bar on a phone.
        `<div class="dkr-tray" hidden>` +
          `<div class="dkr-tray-head">` +
            `<span class="dkr-lbl">Playback settings</span>` +
            `<button class="dkr-btn dkr-ghost" data-act="tray-close" type="button" aria-label="Close settings">×</button>` +
          `</div>` +
          `<div class="dkr-field">` +
            `<span class="dkr-lbl">Voice</span>` +
            `<button class="dkr-voice-btn" type="button" aria-expanded="false">` +
              `<span class="dkr-voice-name">Loading voices…</span>` +
              `<span class="dkr-chev">${ICON.chevron}</span>` +
            `</button>` +
            `<div class="dkr-voice-list" hidden></div>` +
          `</div>` +
          `<div class="dkr-field dkr-inline-field">` +
            `<span class="dkr-lbl">Pitch</span>` +
            `<input class="dkr-pitch" type="range" min="0.6" max="1.6" step="0.05">` +
            `<span class="dkr-pitch-val"></span>` +
          `</div>` +
          `<label class="dkr-check"><input type="checkbox" class="dkr-code"><span>Read code blocks</span></label>` +
          `<label class="dkr-check"><input type="checkbox" class="dkr-answers"><span>Read answers on hidden cards</span></label>` +
          `<div class="dkr-note"></div>` +
        `</div>`;
      document.body.appendChild(el);

      ui = {
        el,
        chip: el.querySelector(".dkr-chip"),
        toggles: el.querySelectorAll('[data-act="toggle"]'),
        now: el.querySelector(".dkr-now"),
        tracks: el.querySelectorAll(".dkr-track"),
        fills: el.querySelectorAll(".dkr-fill"),
        scopes: el.querySelectorAll(".dkr-scope"),
        timeAt: el.querySelectorAll(".dkr-time-at"),
        timeAll: el.querySelectorAll(".dkr-time-all"),
        sheet: el.querySelector(".dkr-sheet"),
        sheetTopic: el.querySelector(".dkr-sheet-topic"),
        sheetTab: el.querySelector(".dkr-sheet-tab"),
        lines: el.querySelector(".dkr-lines"),
        count: el.querySelector(".dkr-count"),
        followBtn: el.querySelector(".dkr-follow"),
        rate: el.querySelector(".dkr-rate"),
        tray: el.querySelector(".dkr-tray"),
        voiceBtn: el.querySelector(".dkr-voice-btn"),
        voiceName: el.querySelector(".dkr-voice-name"),
        voiceList: el.querySelector(".dkr-voice-list"),
        pitch: el.querySelector(".dkr-pitch"),
        pitchVal: el.querySelector(".dkr-pitch-val"),
        code: el.querySelector(".dkr-code"),
        answers: el.querySelector(".dkr-answers"),
        note: el.querySelector(".dkr-note"),
        launcher: null,
      };

      [0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].forEach((r) => {
        const o = document.createElement("option");
        o.value = String(r);
        o.textContent = r + "×";
        ui.rate.appendChild(o);
      });
      ui.rate.value = String(rate());
      ui.pitch.value = String(pitch());
      ui.pitchVal.textContent = pitch().toFixed(2);
      ui.code.checked = readCode();
      ui.answers.checked = readAnswers();

      el.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "toggle") toggle();
        else if (act === "prev") seek(-1);
        else if (act === "next") seek(1);
        else if (act === "stop") stop();
        else if (act === "tray") { ui.tray.hidden = !ui.tray.hidden; }
        else if (act === "tray-close") { ui.tray.hidden = true; }
        else if (act === "sheet") toggleSheet();
        else if (act === "sheet-close") closeSheet();
        else if (act === "close") closePlayer();
      });

      // Transcript interaction. A word inside the live line is the finest jump
      // the engine can honour; anywhere else on a line starts that sentence.
      ui.lines.addEventListener("click", (e) => {
        const word = e.target.closest(".dkr-w");
        const line = e.target.closest(".dkr-line");
        if (!line) return;
        const i = Number(line.dataset.i);
        jumpTo(i, word ? Number(word.dataset.c) : null);
      });

      // Scrolling is browsing, never seeking. Any real scroll gesture drops
      // the follow lock and raises the way back.
      ["wheel", "touchmove", "pointerdown"].forEach((ev) => {
        ui.lines.addEventListener(ev, () => { if (follow) setFollow(false); }, { passive: true });
      });
      ui.lines.addEventListener("keydown", (e) => {
        if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) setFollow(false);
      });
      ui.followBtn.addEventListener("click", () => setFollow(true));

      ui.chip.addEventListener("click", jumpToPlaying);

      ui.rate.addEventListener("change", () => {
        setPref(KEY_RATE, ui.rate.value);
        if (state.status === "playing") resumeFromWord();
        draw();
      });

      ui.pitch.addEventListener("input", () => {
        setPref(KEY_PITCH, ui.pitch.value);
        ui.pitchVal.textContent = parseFloat(ui.pitch.value).toFixed(2);
      });
      ui.pitch.addEventListener("change", () => {
        if (state.status === "playing") resumeFromWord();
      });

      ui.code.addEventListener("change", () => {
        setPref(KEY_CODE, ui.code.checked ? "1" : "0");
        recollectInPlace();
      });
      ui.answers.addEventListener("change", () => {
        setPref(KEY_ANSWERS, ui.answers.checked ? "1" : "0");
        recollectInPlace();
      });

      ui.voiceBtn.addEventListener("click", () => {
        const open = ui.voiceList.hidden;
        ui.voiceList.hidden = !open;
        ui.voiceBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });

      ui.tracks.forEach((track) => {
        track.addEventListener("click", (e) => {
          if (!state.units.length) return;
          const rect = track.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          seekTo(Math.round(ratio * (state.units.length - 1)));
        });
        track.addEventListener("keydown", (e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); seek(-1); }
          if (e.key === "ArrowRight") { e.preventDefault(); seek(1); }
        });
      });

      // The speed control belongs beside the transport on a laptop and inside
      // the settings tray on a phone, where the bar has no room for it. One
      // control, moved — not two that can disagree.
      const narrow = window.matchMedia
        ? window.matchMedia("(max-width: 640px)")
        : { matches: false, addEventListener: null };
      const placeRate = () => {
        const wrap = el.querySelector(".dkr-rate-wrap");
        const home = narrow.matches ? ui.tray : el.querySelector(".dkr-row");
        if (wrap.parentElement !== home) {
          if (narrow.matches) home.insertBefore(wrap, home.querySelector(".dkr-field"));
          else home.insertBefore(wrap, home.querySelector(".dkr-transport"));
        }
        wrap.classList.toggle("in-tray", narrow.matches);
      };
      placeRate();
      if (narrow.addEventListener) narrow.addEventListener("change", placeRate);

      drawVoices();
      return ui;
    }

    // Changing what counts as readable mid-session must not lose the place:
    // remember the element being read, rebuild, and land on it again.
    function recollectInPlace() {
      if (!state.scope) return;
      const anchor = state.units[state.idx];
      const anchorEl = anchor ? anchor.el : null;
      const anchorStart = anchor ? anchor.s : 0;
      const anchorText = anchor ? anchor.text : "";
      const wasPlaying = state.status === "playing";
      rebuild();
      let next = 0;
      if (anchorEl) {
        let hit = state.units.findIndex((u) => u.el === anchorEl && u.e > anchorStart);
        // A re-rendered deck replaces its elements outright, so fall back to
        // finding the same sentence again by its text.
        if (hit < 0 && anchorText) hit = state.units.findIndex((u) => u.text === anchorText);
        next = hit >= 0 ? hit : Math.min(state.idx, Math.max(0, state.units.length - 1));
      }
      state.idx = Math.max(0, Math.min(next, Math.max(0, state.units.length - 1)));
      if (sheetOpen) renderLines();
      if (wasPlaying) speakFrom(state.idx, 0);
      else draw();
    }

    function drawVoices() {
      if (!ui) return;
      const cur = currentVoice();
      ui.voiceName.textContent = cur ? cur.name : (hasSpeech ? "System default" : "No speech engine");
      ui.voiceList.innerHTML = "";
      voices.forEach((v) => {
        const row = document.createElement("div");
        row.className = "dkr-voice" + (cur && v.name === cur.name ? " on" : "");
        const pick = document.createElement("button");
        pick.type = "button";
        pick.className = "dkr-voice-pick";
        const rank = naturalRank(v);
        pick.innerHTML =
          `<span class="dkr-vname">${escapeHtml(v.name)}</span>` +
          `<span class="dkr-vlang">${escapeHtml(v.lang || "")}</span>` +
          (rank === 0 ? `<span class="dkr-vtag">natural</span>` : rank === 1 ? `<span class="dkr-vtag alt">online</span>` : "");
        pick.addEventListener("click", () => {
          setPref(KEY_VOICE, v.name);
          drawVoices();
          if (state.status === "playing") resumeFromWord();
        });
        const prev = document.createElement("button");
        prev.type = "button";
        prev.className = "dkr-voice-prev";
        prev.title = "Preview this voice";
        prev.setAttribute("aria-label", "Preview " + v.name);
        prev.innerHTML = ICONS.speaker;
        prev.addEventListener("click", (e) => {
          e.stopPropagation();
          previewVoice(v);
        });
        row.appendChild(pick);
        row.appendChild(prev);
        ui.voiceList.appendChild(row);
      });
    }

    // Previewing takes over the engine, so anything playing is paused first
    // rather than being silently killed.
    function previewVoice(v) {
      if (!hasSpeech) return;
      if (state.status === "playing") pause();
      state.gen++;
      try { synth.cancel(); } catch (e) { /* ignore */ }
      setTimeout(() => {
        const u = new SpeechSynthesisUtterance("This is how this voice reads your notes.");
        u.voice = v;
        u.lang = v.lang;
        u.rate = rate();
        u.pitch = pitch();
        try { synth.speak(u); } catch (e) { /* ignore */ }
      }, 90);
    }

    function setNote(msg) {
      if (ui && ui.note) ui.note.textContent = msg || "";
    }

    // ----- transcript sheet -------------------------------------------------
    // The whole scope as a scrollable list of sentences, the current one lit,
    // scrolling itself as the narration moves. Scrolling it never changes what
    // is playing — browsing ahead and jumping are deliberately separate
    // gestures, so looking for something you half-remember cannot knock the
    // narration off its place. Tapping a line is the jump.

    // 3,000-odd sentences is a lot of DOM. `content-visibility` lets the
    // browser skip layout and paint for the ones off screen, and a per-line
    // size estimate keeps the scrollbar honest while it does.
    let paintedIdx = -1;

    function estimateHeight(text) {
      const lines = Math.max(1, Math.ceil(text.length / 42));
      return 18 + lines * 30;
    }

    function renderLines() {
      if (!ui) return;
      ui.lines.innerHTML = "";
      lineEls = [];
      paintedIdx = -1;
      const frag = document.createDocumentFragment();
      state.units.forEach((unit, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "dkr-line";
        b.dataset.i = String(i);
        b.style.containIntrinsicSize = "auto " + estimateHeight(unit.text) + "px";
        b.textContent = unit.text;
        frag.appendChild(b);
        lineEls.push(b);
      });
      ui.lines.appendChild(frag);
      paintLines(true);
    }

    // Splits the live sentence into words so a single word can be the target of
    // a jump — the finest grain the engine can actually resume from.
    function decorateWords(el, unit) {
      el.textContent = "";
      const text = unit.text;
      const re = /\S+\s*/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const span = document.createElement("span");
        span.className = "dkr-w";
        span.dataset.c = String(unit.s + m.index);
        span.textContent = m[0];
        el.appendChild(span);
      }
    }

    function paintSpokenWords() {
      if (!sheetOpen || !ui) return;
      const el = lineEls[state.idx];
      if (!el || !el.firstElementChild) return;
      const upto = state.lastChar;
      el.querySelectorAll(".dkr-w").forEach((w) => {
        w.classList.toggle("is-spoken", Number(w.dataset.c) < upto);
      });
    }

    function paintLines(force) {
      if (!ui || !lineEls.length) return;
      if (!force && paintedIdx === state.idx) return;
      const prev = lineEls[paintedIdx];
      if (prev) {
        prev.classList.remove("is-current");
        prev.textContent = state.units[paintedIdx] ? state.units[paintedIdx].text : prev.textContent;
      }
      if (force) {
        lineEls.forEach((el, i) => el.classList.toggle("is-past", i < state.idx));
      } else {
        for (let i = Math.min(paintedIdx, state.idx); i <= Math.max(paintedIdx, state.idx) && i >= 0; i++) {
          if (lineEls[i]) lineEls[i].classList.toggle("is-past", i < state.idx);
        }
      }
      const cur = lineEls[state.idx];
      if (cur) {
        cur.classList.add("is-current");
        cur.classList.remove("is-past");
        decorateWords(cur, state.units[state.idx]);
        paintSpokenWords();
      }
      paintedIdx = state.idx;
      if (ui.count) ui.count.textContent = `${state.idx + 1} / ${state.units.length}`;
      if (sheetOpen && follow) followCurrent();
    }

    function followCurrent(instant) {
      const cur = lineEls[state.idx];
      if (!cur || !ui) return;
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      try {
        cur.scrollIntoView({ block: "center", behavior: instant || reduce ? "auto" : "smooth" });
      } catch (e) {
        cur.scrollIntoView(true);
      }
    }

    function setFollow(on) {
      follow = !!on;
      if (ui && ui.followBtn) ui.followBtn.hidden = follow;
      if (follow) followCurrent();
    }

    // A jump is always explicit: a tap on a line, or on a word inside the live
    // line. Never a scroll.
    function jumpTo(index, charOffset) {
      if (index < 0 || index >= state.units.length) return;
      setFollow(true);
      if (state.status === "idle") {
        playScope(state.scope, { index });
        if (charOffset != null) speakFrom(index, charOffset);
        return;
      }
      state.retries = 0;
      if (state.status === "paused") {
        state.idx = index;
        const unit = state.units[index];
        state.lastChar = charOffset != null ? charOffset : unit.s;
        state.charOffset = state.lastChar;
        revealUnit(unit);
        paintSentence(unit);
        draw();
        paintLines();
        return;
      }
      speakFrom(index, charOffset != null ? charOffset : 0);
    }

    function openSheet() {
      if (!ui) buildUI();
      if (state.status === "idle" && !state.units.length) {
        const viewed = viewedScope();
        if (viewed) prepare(viewed.id);
      }
      sheetOpen = true;
      ui.sheet.hidden = false;
      document.body.classList.add("dk-sheet-open");
      renderLines();
      setFollow(true);
      followCurrent(true);
      draw();
    }

    function closeSheet() {
      sheetOpen = false;
      if (ui) ui.sheet.hidden = true;
      document.body.classList.remove("dk-sheet-open");
      draw();
    }

    function toggleSheet() {
      if (sheetOpen) closeSheet(); else openSheet();
    }

    function draw() {
      if (!ui) return;
      const playing = state.status === "playing";
      ui.toggles.forEach((b) => {
        b.innerHTML = playing ? ICONS.pausing : ICONS.play;
        b.setAttribute("aria-label", playing ? "Pause" : "Play");
      });
      ui.el.classList.toggle("is-playing", playing);
      ui.el.classList.toggle("sheet-open", sheetOpen);

      const scope = scopeById(state.scope);
      const total = state.units.length;
      const done = total ? state.idx + 1 : 0;
      const label = scope ? `${scope.label.toLowerCase()} · ${done}/${total}` : "nothing loaded";
      ui.scopes.forEach((n) => { n.textContent = label; });
      const pct = total ? `${(done / total) * 100}%` : "0%";
      ui.fills.forEach((n) => { n.style.width = pct; });
      ui.now.textContent = state.units[state.idx] ? state.units[state.idx].text : "";
      const elapsed = fmtTime(secondsFor(state.units, 0, state.idx));
      const all = fmtTime(secondsFor(state.units, 0, total));
      ui.timeAt.forEach((n) => { n.textContent = elapsed; });
      ui.timeAll.forEach((n) => { n.textContent = all; });
      ui.tracks.forEach((n) => {
        n.setAttribute("aria-valuenow", String(done));
        n.setAttribute("aria-valuemax", String(total));
      });
      if (scope) {
        ui.sheetTopic.textContent = scope.topic.replace(/-/g, " ");
        ui.sheetTab.textContent = scope.label.toLowerCase();
      }
      if (ui.count) ui.count.textContent = total ? `${done} / ${total}` : "";

      if (ui.launcher) {
        ui.launcher.classList.toggle("on", state.status !== "idle");
        ui.launcher.innerHTML = playing ? ICONS.pausing : ICONS.play;
      }
      drawChip();
    }

    // "Now playing elsewhere": without it, switching tabs mid-playback means
    // losing track of what the voice is actually reading.
    function drawChip() {
      if (!ui) return;
      const viewed = viewedScope();
      const scope = scopeById(state.scope);
      const away = state.status !== "idle" && scope && viewed && viewed.id !== scope.id;
      ui.chip.hidden = !away;
      if (away) {
        ui.chip.innerHTML =
          `<span class="dkr-chip-icon">${state.status === "playing" ? ICONS.pausing : ICONS.play}</span>` +
          `<span>${escapeHtml(scope.label.toLowerCase())} · ${state.idx + 1}/${state.units.length}</span>` +
          `<span class="dkr-chip-cta">jump back</span>`;
      }
    }

    function jumpToPlaying() {
      const scope = scopeById(state.scope);
      if (!scope) return;
      if (scope.tab) {
        const btn = document.querySelector(`.tab-btn[data-tab="${scope.tab}"]`);
        if (btn) btn.click();
      }
      const unit = state.units[state.idx];
      if (unit) {
        revealUnit(unit);
        unit.el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      draw();
    }

    function openPlayer() {
      if (!ui) buildUI();
      ui.el.hidden = false;
      state.open = true;
      document.body.classList.add("dk-reader-open");
      draw();
    }

    function closePlayer() {
      if (state.status !== "idle") stop();
      if (sheetOpen) closeSheet();
      if (ui) { ui.el.hidden = true; ui.tray.hidden = true; }
      state.open = false;
      document.body.classList.remove("dk-reader-open");
    }

    // ----- header controls ---------------------------------------------------
    function mountHeader() {
      const right = document.querySelector(".site-header .right");
      if (!right) return;
      const themeBtn = right.querySelector(".theme-toggle");

      if (!lockBtn) {
        const lock = document.createElement("button");
        lock.type = "button";
        lock.className = "dkr-lock";
        lock.innerHTML = ICONS.lock;
        lock.title = "Expand everything and freeze it open";
        lock.setAttribute("aria-pressed", "false");
        lock.addEventListener("click", () => setLocked(!state.locked));
        right.insertBefore(lock, themeBtn || null);
        lockBtn = lock;
      }

      // The launcher only appears where there is something to read. On pages
      // whose content arrives by fetch this is re-checked as the DOM settles.
      if (hasSpeech && !right.querySelector(".dkr-launcher") && scopes().length) {
        const launcher = document.createElement("button");
        launcher.type = "button";
        launcher.className = "dkr-launcher";
        launcher.innerHTML = ICONS.play;
        launcher.title = "Read this page aloud";
        launcher.setAttribute("aria-label", "Read aloud");
        launcher.addEventListener("click", () => {
          if (!ui) buildUI();
          if (!state.open) {
            openPlayer();
            if (state.status === "idle") {
              const scope = viewedScope();
              if (scope) playScope(scope.id);
            }
          } else {
            toggle();
          }
        });
        right.insertBefore(launcher, lockBtn);
        if (!ui) buildUI();
        ui.launcher = launcher;
      }
    }

    // ----- inline play buttons ------------------------------------------------
    // Landscape nodes and elaboration sections only. Deck cards deliberately
    // get none: hundreds of tiny buttons is clutter, not control.
    function mountInline() {
      if (!hasSpeech) return;
      const targets = [];
      const landscape = document.getElementById("tab-landscape");
      const elaboration = document.getElementById("tab-elaboration");
      if (landscape) targets.push(...landscape.querySelectorAll("details.node-block > summary.node-summary"));
      if (elaboration) targets.push(...elaboration.querySelectorAll("details.el-block > summary.node-summary"));
      targets.forEach((summary) => {
        if (summary.querySelector(".dkr-inline")) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dkr-inline";
        btn.innerHTML = ICONS.play;
        btn.title = "Read this section aloud";
        btn.setAttribute("aria-label", "Read this section aloud");
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const block = summary.parentElement;
          const tab = block.closest("#tab-landscape, #tab-elaboration");
          if (!tab) return;
          const scope = scopes().find((s) => s.root === tab);
          if (scope) playScope(scope.id, { element: block });
        });
        summary.appendChild(btn);
      });
    }

    // ----- keyboard -------------------------------------------------------------
    function onKey(e) {
      if (!state.open) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); seek(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); seek(1); }
      else if (e.key === "Escape") {
        e.preventDefault();
        // Esc peels one layer at a time: settings, then transcript, then the
        // player itself.
        if (ui && !ui.tray.hidden) ui.tray.hidden = true;
        else if (sheetOpen) closeSheet();
        else closePlayer();
      }
    }

    // ----- mount ------------------------------------------------------------------
    function mount() {
      if (document.body.dataset.dkReader === "1") return;
      document.body.dataset.dkReader = "1";
      mountHeader();
      mountInline();
      document.addEventListener("keydown", onKey);
      document.addEventListener("click", guardLock, true);

      if (hasSpeech) {
        loadVoices();
        synth.addEventListener("voiceschanged", loadVoices);
        wireMediaSession();
        // Audio does not survive navigation — bookmark what is in flight.
        window.addEventListener("pagehide", () => {
          if (state.scope && state.units.length) setBookmark(state.scope, state.idx, state.units.length);
          try { synth.cancel(); } catch (e) { /* ignore */ }
        });
      }

      // Content is fetched after load, so the inline buttons and the chip have
      // to follow the DOM rather than being placed once at mount.
      let pending = null;
      const obs = new MutationObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(() => {
          mountHeader();
          mountInline();
          drawChip();
          // A filter change or a deck re-render replaces the very elements the
          // unit list points at. Detached elements still yield text, so this
          // would otherwise keep narrating a list that is no longer on screen.
          const cur = state.units[state.idx];
          if (state.status !== "idle" && cur && !cur.el.isConnected) recollectInPlace();
        }, 200);
      });
      obs.observe(document.body, { childList: true, subtree: true });

      // Switching tabs must never interrupt what is speaking; it only changes
      // what the chip says.
      document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => setTimeout(drawChip, 0));
      });
    }

    return {
      mount,
      play: (scopeId, opts) => playScope(scopeId || (viewedScope() && viewedScope().id), opts),
      pause, resume, stop, toggle, seek,
      open: openPlayer,
      close: closePlayer,
      sheet: toggleSheet,
      openSheet,
      closeSheet,
      lock: setLocked,
      scopes,
      collect: (scopeId) => {
        const s = scopeById(scopeId || (viewedScope() && viewedScope().id));
        return s ? collect(s) : [];
      },
      state,
      available: hasSpeech,
    };
  })();

  return { basePath, fetchJSON, loadTracker, loadAllRecall, loadAllPrep, loadAllElaboration, statusOf, runBoot, initTheme, wireThemeToggle, setTheme, getMark, setMark, renderDeck, MARK_TYPES, getNotes, setNotes, noteCount, buildMarkdown, buildBackup, importBackup, plainText, highlight, addCopyButtons, makeSectionsCollapsible, addExpandControls, addBlockFooter, addLocalControls, decorateBlocks, revealHash, ICON, reader };
})();

// Apply theme immediately on script load (before body renders) to avoid a flash.
DK.initTheme();

// The read-aloud player mounts itself: every page in the repo already loads this
// file, so there is nothing to add to the pages themselves.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => DK.reader.mount());
} else {
  DK.reader.mount();
}
