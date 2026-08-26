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

  return { basePath, fetchJSON, loadTracker, loadAllRecall, loadAllPrep, loadAllElaboration, statusOf, runBoot, initTheme, wireThemeToggle, setTheme, getMark, setMark, renderDeck, MARK_TYPES, getNotes, setNotes, noteCount, buildMarkdown, buildBackup, importBackup, plainText, highlight, addCopyButtons, makeSectionsCollapsible, addExpandControls, addBlockFooter, addLocalControls, decorateBlocks, revealHash, ICON };
})();

// Apply theme immediately on script load (before body renders) to avoid a flash.
DK.initTheme();
