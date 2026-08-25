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
      bar.querySelectorAll(".mf-btn").forEach((btn) => {
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

      function autoGrow(ta) {
        ta.style.height = "auto";
        ta.style.height = Math.max(ta.scrollHeight, 44) + "px";
      }

      function drawNote(note, index) {
        const item = document.createElement("div");
        item.className = "nt-item";

        const meta = document.createElement("div");
        meta.className = "nt-meta";
        const ts = document.createElement("span");
        ts.className = "nt-ts";
        ts.textContent = formatNoteTime(note.ts);
        const del = document.createElement("button");
        del.className = "nt-del";
        del.type = "button";
        del.textContent = "×";
        del.title = "Delete this follow-up";
        del.setAttribute("aria-label", "Delete this follow-up");
        meta.appendChild(ts);
        meta.appendChild(del);

        const ta = document.createElement("textarea");
        ta.className = "nt-text";
        ta.rows = 2;
        ta.placeholder = "what's the doubt?";
        ta.value = note.text || "";

        item.appendChild(meta);
        item.appendChild(ta);
        listWrap.appendChild(item);
        autoGrow(ta);

        // Typing inside a note must not toggle the answer reveal.
        item.addEventListener("click", (e) => e.stopPropagation());

        let timer = null;
        ta.addEventListener("input", () => {
          note.text = ta.value;
          autoGrow(ta);
          clearTimeout(timer);
          timer = setTimeout(persist, 300);
        });
        ta.addEventListener("blur", persist);

        del.addEventListener("click", (e) => {
          e.stopPropagation();
          working.splice(working.indexOf(note), 1);
          persist();
          item.remove();
          if (activeFilter === "noted" && !working.length) drawCards();
          drawBar();
        });

        return ta;
      }

      working.forEach(drawNote);
      updateAddLabel();

      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const note = { ts: Date.now(), text: "" };
        working.push(note);
        const ta = drawNote(note);
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

  return { basePath, fetchJSON, loadTracker, loadAllRecall, loadAllElaboration, statusOf, runBoot, initTheme, wireThemeToggle, getMark, setMark, renderDeck, MARK_TYPES, getNotes, setNotes, noteCount };
})();

// Apply theme immediately on script load (before body renders) to avoid a flash.
DK.initTheme();
