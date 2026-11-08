"""Boilerplate and duplicate cleaning for the knowledge base (C1-4).

No ITU imports, so it runs and is tested without the ITU repo:
    echo "text" | python kb/clean.py -        # print cleaned text
kb/build.py applies strip_boilerplate() to each source before ITU's chunk_text,
and drop_near_duplicates() to the chunks afterwards.

Conservative on purpose: it removes phrases that are never policy content
(accessibility skip links, cookie and share prompts) and chunks that repeat
another chunk. Stripping a page's whole navigation menu needs the real pages,
so that step is judged by eye after a rebuild.
"""
import re
import sys

_BOILER = [
    r"skip to (?:main )?content(?: / navigation)?",
    r"skip to navigation",
    r"we use cookies[^.]*\.",
    r"this (?:website|site) uses cookies[^.]*\.",
    r"accept (?:all )?cookies",
    r"cookie (?:settings|preferences|policy)",
    r"follow us on [A-Za-z ,]+",
    r"share (?:this|on) (?:facebook|twitter|linkedin|x|whatsapp|email)(?: [A-Za-z]+)*",
    r"subscribe to our newsletter",
    r"all rights reserved\.?",
    r"enable javascript[^.]*\.",
]
_RX = re.compile(r"(?i)\b(?:" + "|".join(_BOILER) + r")")


def strip_boilerplate(text: str) -> str:
    out = _RX.sub(" ", text)
    return re.sub(r"[ \t]{2,}", " ", out).strip()


def _shingles(text: str, n: int = 5) -> set:
    w = re.findall(r"[a-z0-9]+", text.lower())
    return {" ".join(w[i:i + n]) for i in range(max(1, len(w) - n + 1))}


def drop_near_duplicates(chunks: list, threshold: float = 0.8) -> list:
    """Keep the first of any chunks whose 5-word shingles overlap (Jaccard) at
    or above the threshold. Chunk overlap from the chunker itself is far lower."""
    kept, sigs = [], []
    for c in chunks:
        s = _shingles(c["text"])
        if any(len(s & t) / max(1, len(s | t)) >= threshold for t in sigs):
            continue
        kept.append(c)
        sigs.append(s)
    return kept


if __name__ == "__main__":
    if sys.argv[1:] == ["-"]:
        sys.stdout.write(strip_boilerplate(sys.stdin.read()) + "\n")
    else:
        sys.exit("usage: python kb/clean.py -   (text on stdin)")
