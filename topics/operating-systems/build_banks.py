#!/usr/bin/env python3
"""Assembles recall.json (Bank A) and prep.json (Bank B) from _bank/*.py fragments.

Each fragment defines CARDS = [(category, title, question, answer), ...].
Recall fragments are named recall-NN-*.py and are concatenated in filename
order — which is landscape-node order. Prep fragments are prep-NN-*.py and are
ordered by tier. Numbering is assigned here so no card is ever hand-numbered.

    python3 topics/operating-systems/build_banks.py
"""
import importlib.util, json, pathlib, sys

here = pathlib.Path(__file__).parent

def load(prefix):
    cards, seen = [], set()
    for path in sorted((here / "_bank").glob(f"{prefix}-*.py")):
        spec = importlib.util.spec_from_file_location(path.stem, path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for c, t, q, a in mod.CARDS:
            key = q.strip().lower()
            if key in seen:
                print(f"  ! duplicate question in {path.name}: {q[:60]}")
                continue
            seen.add(key)
            cards.append({"n": len(cards) + 1, "c": c, "t": t, "q": q, "a": a})
    return cards

def main():
    for prefix, out in (("recall", "recall.json"), ("prep", "prep.json")):
        cards = load(prefix)
        (here / out).write_text(
            json.dumps({"cards": cards}, ensure_ascii=False, indent=1) + "\n",
            encoding="utf-8")
        by = {}
        for c in cards:
            by[c["c"]] = by.get(c["c"], 0) + 1
        print(f"{out}: {len(cards)} cards across {len(by)} categories")
    return 0

sys.exit(main())
