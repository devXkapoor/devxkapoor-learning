// devxkapoor-learning :: shared data loading utilities
// Used by index.html, recall.html, search.html, and per-topic pack.html files.

const DK = (() => {
  const basePath = (() => {
    // Works whether served at root or under /devxkapoor-learning/ (GitHub Pages project site)
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

  // Discovers topics by reading tracker.json sections (topic slugs), then
  // attempts to fetch each topic's recall.json / elaboration.json if present.
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

  return { basePath, fetchJSON, loadTracker, loadAllRecall, loadAllElaboration, statusOf };
})();
