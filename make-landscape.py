#!/usr/bin/env python3
"""Extracts each topic's landscape prose from pack.html into landscape.json.

The landscape is authored inline in pack.html, which is fine for the website —
it is the page. It is not fine for anything else: an app, a search index or a
second front end would each have to parse a full HTML document and hope the
surrounding markup never moves.

So this publishes the same content as data, in exactly the shape
elaboration.json already uses:

    {"sections": [{"anchor": ..., "title": ..., "content": ...}]}

which means a consumer needs no landscape-specific code at all.

Splitting on <h3> matches how the site itself renders the landscape — one
collapsible block per node — so the sections here and the blocks on the page are
the same thing.

Run after editing any pack.html landscape, and before committing:

    python3 make-landscape.py
"""
import json
import pathlib
import re
import sys

root = pathlib.Path(__file__).parent


def landscape_html(page: str) -> str | None:
    """The contents of the .prose div inside #tab-landscape, or None."""
    start = page.find('<div id="tab-landscape">')
    if start == -1:
        return None

    # Walk div depth to find the real closing tag rather than the first one.
    depth = 0
    end = None
    for match in re.finditer(r"<div\b|</div>", page[start:]):
        depth += 1 if match.group(0).startswith("<div") else -1
        if depth == 0:
            end = start + match.end()
            break
    if end is None:
        return None

    inner = re.search(r'<div class="prose">(.*)</div>\s*$', page[start:end], re.S)
    return inner.group(1).strip() if inner else None


def anchorise(title: str, taken: set[str]) -> str:
    slug = re.sub(r"<[^>]+>", "", title).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")[:60] or "node"
    candidate, n = slug, 2
    while candidate in taken:
        candidate, n = f"{slug}-{n}", n + 1
    taken.add(candidate)
    return candidate


def sections_from(html: str) -> list[dict]:
    """One section per <h3>, plus a lead-in section for anything before the first."""
    parts = re.split(r"(<h3\b[^>]*>.*?</h3>)", html, flags=re.S)
    sections: list[dict] = []
    taken: set[str] = set()

    lead = parts[0].strip()
    if lead:
        sections.append(
            {"anchor": anchorise("overview", taken), "title": "Overview", "content": lead}
        )

    for heading, body in zip(parts[1::2], parts[2::2]):
        title = re.sub(r"</?h3\b[^>]*>", "", heading).strip()
        sections.append(
            {
                "anchor": anchorise(title, taken),
                "title": title,
                "content": body.strip(),
            }
        )
    return sections


def main() -> int:
    written = 0
    for pack in sorted(root.glob("topics/*/pack.html")):
        html = landscape_html(pack.read_text(encoding="utf-8"))
        if not html:
            print(f"  skip {pack.parent.name}: no landscape block")
            continue

        sections = sections_from(html)
        out = pack.parent / "landscape.json"
        payload = json.dumps({"sections": sections}, ensure_ascii=False, indent=2) + "\n"

        # Only rewrite when something changed, so re-running leaves the tree
        # untouched and the script is safe to call from any workflow.
        if out.exists() and out.read_text(encoding="utf-8") == payload:
            print(f"  {pack.parent.name}: unchanged ({len(sections)} sections)")
            continue

        out.write_text(payload, encoding="utf-8")
        written += 1
        words = sum(len(re.sub(r"<[^>]+>", " ", s["content"]).split()) for s in sections)
        print(f"  {pack.parent.name}: {len(sections)} sections, ~{words:,} words")

    print(f"landscape.json written for {written} topic(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
