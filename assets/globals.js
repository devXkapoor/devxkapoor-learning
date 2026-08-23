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

  return { basePath, fetchJSON, loadTracker, loadAllRecall, loadAllElaboration, statusOf, runBoot };
})();
