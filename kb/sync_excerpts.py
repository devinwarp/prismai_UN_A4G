"""Add or refresh the excerpt-only sources of kb/sources.json in kb/chunks.json.

Same chunk format as the excerpt branch of kb/build.py, but needs no ITU repo and no
network: excerpt sources are pure data. Existing chunks of other sources are untouched
and keep their order; chunks of an excerpt source are replaced in place (new sources are
appended). Usage:  python kb/sync_excerpts.py [source_id ...]   (default: all excerpt sources)
Then re-embed:     node scripts/embed_kb.ts
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEYS = ("title", "url", "issuer", "jurisdiction", "instrument_type", "binding", "date", "topics")

sources = [s for s in json.loads((HERE / "sources.json").read_text(encoding="utf-8")) if s.get("excerpts")]
only = set(sys.argv[1:])
chunks = json.loads((HERE / "chunks.json").read_text(encoding="utf-8"))
lock = json.loads((HERE / "sources.lock.json").read_text(encoding="utf-8"))
for s in sources:
    sid = s["id"]
    if only and sid not in only:
        continue
    meta = {k: s[k] for k in KEYS if k in s}
    meta["matrix_quadrants"] = s.get("matrix_quadrants", [])
    new = []
    for i, e in enumerate(s["excerpts"]):
        assert len(e["text"].split()) <= 40, f"{sid}: excerpt over 40 words: {e['text'][:40]}"
        new.append({"chunk_id": f"{sid}#{i}", "source_id": sid, "text": f"“{e['text']}” ({e['where']})", "sha256": s["source_sha256"], **meta, **({"section": e["section"]} if e.get("section") else {})})
    at = [i for i, c in enumerate(chunks) if c["source_id"] == sid]
    if at:
        chunks = [c for c in chunks if c["source_id"] != sid]
        chunks[at[0]:at[0]] = new
    else:
        chunks += new
    lock[sid] = {"sha256": s["source_sha256"], "bytes": 0, "chars": sum(len(e["text"]) for e in s["excerpts"])}
(HERE / "chunks.json").write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")
(HERE / "sources.lock.json").write_text(json.dumps(lock, indent=1), encoding="utf-8")
print(f"{len(lock)} sources, {len(chunks)} chunks")
