#!/usr/bin/env python3
"""Assembles topics/operating-systems/pack.html from _nodes/*.html fragments.

The landscape for this topic is far too large to edit safely as one file — a
single bad range-replacement in a 500KB pack.html loses work silently. So each
node is authored as its own fragment under _nodes/, named NN-slug.html, and this
script concatenates them in filename order into the template's
{{LANDSCAPE_HTML}} slot.

Fragments are plain HTML: one <h3> per node, <p> prose, <ul>/<li> only where the
content is genuinely a list.

    python3 topics/operating-systems/build.py
"""
import pathlib, re, sys

here = pathlib.Path(__file__).parent
root = here.parent.parent

SLUG = "operating-systems"
LABEL = "Operating systems"
TAGLINE = ("From a wire that is either on or off to a Kubernetes pod being throttled — "
           "the complete causal chain of why an operating system exists, what every one "
           "of its mechanisms is for, and how each one shows up in the stack you actually write.")

CLOSERS = ("<p><strong>What you can do at this point:",
           "<p><strong>What's still broken:")


LANDSCAPE_IIFE_OLD = """// Landscape: split the flat prose into collapsible nodes, closed by default,
// so 19 nodes read as a navigable list instead of one continuous wall.
(function () {
  const prose = document.querySelector("#tab-landscape .prose");
  if (!prose) return;
  const n = DK.makeSectionsCollapsible(prose, { startOpen: false });
  DK.addCopyButtons(prose);
  DK.decorateBlocks(prose);
  if (n) DK.addExpandControls(document.getElementById("tab-landscape"), prose, n + " nodes");
})();"""

LANDSCAPE_IIFE_NEW = """// Landscape: three disclosure levels — part, node, and the node's own
// sections — matching the elaboration tab exactly.
(function () {
  const root = document.querySelector("#tab-landscape .prose");
  if (!root) return;

  // .prose carries a 68ch cap. Wrapping the blocks from the OUTSIDE it
  // constrains the boxes themselves, not just the text, which is why the
  // landscape rendered at roughly 60% of the page while elaboration ran full
  // width. Drop it here; makeSectionsNested puts a .prose inside each body
  // instead, where `.node-body .prose { max-width: none }` cancels the cap —
  // which is precisely how the elaboration tab gets its width.
  root.classList.remove("prose");
  root.classList.add("landscape-root");

  const n = DK.makeSectionsNested(root, [
    { match: "h3.part", cls: "part-block" },
    { match: "h3",      cls: "node-block" },
    { match: "h4",      cls: "sub-block"  }
  ]);

  // Hoist each node's closing lines out of the final sub-section they were
  // authored into and back onto the node. Before decorateBlocks, so the
  // collapse footer stays last.
  root.querySelectorAll("details.node-block").forEach((node) => {
    const body = node.querySelector(":scope > .node-body");
    if (!body) return;
    node.querySelectorAll(".node-close").forEach((close) => body.appendChild(close));
  });

  DK.addCopyButtons(root);
  DK.decorateBlocks(root);
  if (n) DK.addExpandControls(document.getElementById("tab-landscape"), root, n + " sections");
})();"""


def close_wrap(fragment: str) -> str:
    """Wraps a node's two closing paragraphs in <div class="node-close">.

    They were authored after the node's last <h4>, so once <h4>s become
    collapsible sub-sections the splitter puts the node's conclusion inside
    whichever sub-section happened to be last — and collapsing that section
    hides it. The wrapper gives the page script something to hoist back up to
    the node. The prose itself is untouched.
    """
    for marker in CLOSERS:
        i = fragment.rfind(marker)
        if i != -1:
            return fragment[:i] + '<div class="node-close prose">\n' + fragment[i:].rstrip() + "\n</div>"
    return fragment


def main():
    frags = sorted(here.glob("_nodes/*.html"))
    if not frags:
        print("no fragments"); return 1
    body = "\n\n".join(close_wrap(f.read_text(encoding="utf-8").strip()) for f in frags)
    tpl = (root / "templates" / "pack-template.html").read_text(encoding="utf-8")
    out = (tpl.replace("{{TOPIC_SLUG}}", SLUG)
              .replace("{{TOPIC_LABEL}}", LABEL)
              .replace("{{TOPIC_TAGLINE}}", TAGLINE)
              )

    # This topic's landscape is three levels deep, which the shared template's
    # flat single-level script cannot express. Swap that block out here rather
    # than in templates/pack-template.html, so no other topic's pack changes.
    assert out.count(LANDSCAPE_IIFE_OLD) == 1, "template landscape script moved"
    out = out.replace(LANDSCAPE_IIFE_OLD, LANDSCAPE_IIFE_NEW, 1)
    # The template names {{LANDSCAPE_HTML}} twice: once in its leading HTML
    # comment documenting the placeholders, and once in the .prose div. A plain
    # .replace() fills BOTH, injecting the entire landscape into a comment and
    # doubling the file. Replace only the last occurrence.
    marker = "{{LANDSCAPE_HTML}}"
    head, _, tail = out.rpartition(marker)
    assert head, "landscape placeholder missing from template"
    out = head + body + tail
    (here / "pack.html").write_text(out, encoding="utf-8")
    nodes = len(re.findall(r"<h3\b", body))
    words = len(re.sub(r"<[^>]+>", " ", body).split())
    print(f"pack.html: {len(frags)} fragments, {nodes} h3 blocks, ~{words:,} words, {len(out):,} bytes")
    return 0

sys.exit(main())
