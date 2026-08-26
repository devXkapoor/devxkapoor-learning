#!/usr/bin/env python3
"""Stamp asset links with a content hash so browsers can't serve a stale copy.

GitHub Pages sends `cache-control: max-age=600` on assets, so a change to
styles.css or globals.js can take up to ten minutes to reach a browser that
already has them cached — long enough to look like the change never shipped.

Appending ?v=<hash of the file's contents> makes the URL change whenever the
file does, so a fresh copy is fetched immediately, while unchanged assets stay
cached. Run this after editing anything in assets/ and before committing.
"""
import hashlib, pathlib, re, sys

root = pathlib.Path(__file__).parent
digests = {
    name: hashlib.sha256((root / "assets" / name).read_bytes()).hexdigest()[:10]
    for name in ("styles.css", "globals.js")
}

pages = [root / "index.html", root / "recall.html", root / "search.html",
         root / "templates" / "pack-template.html"]
pages += sorted(root.glob("topics/*/pack.html"))

changed = 0
for page in pages:
    if not page.exists():
        continue
    src = original = page.read_text()
    for name, digest in digests.items():
        src = re.sub(
            rf'((?:\.\./)*assets/{re.escape(name)})(\?v=[a-f0-9]+)?',
            rf'\1?v={digest}',
            src,
        )
    if src != original:
        page.write_text(src)
        changed += 1

print(f"asset versions: " + ", ".join(f"{n}={d}" for n, d in digests.items()))
print(f"updated {changed} of {len(pages)} pages")
