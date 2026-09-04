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

def main():
    frags = sorted(here.glob("_nodes/*.html"))
    if not frags:
        print("no fragments"); return 1
    body = "\n\n".join(f.read_text(encoding="utf-8").strip() for f in frags)
    tpl = (root / "templates" / "pack-template.html").read_text(encoding="utf-8")
    out = (tpl.replace("{{TOPIC_SLUG}}", SLUG)
              .replace("{{TOPIC_LABEL}}", LABEL)
              .replace("{{TOPIC_TAGLINE}}", TAGLINE)
              .replace("{{LANDSCAPE_HTML}}", body))
    (here / "pack.html").write_text(out, encoding="utf-8")
    nodes = len(re.findall(r"<h3\b", body))
    words = len(re.sub(r"<[^>]+>", " ", body).split())
    print(f"pack.html: {len(frags)} fragments, {nodes} h3 blocks, ~{words:,} words, {len(out):,} bytes")
    return 0

sys.exit(main())
