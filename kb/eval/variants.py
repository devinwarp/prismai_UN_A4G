"""Build chunking variants for the retrieval experiments (C1-7), outside the repo.

    .venv/Scripts/python kb/eval/variants.py <out_dir> <chunk_words> <overlap_words> [document_prefix]

Re-chunks the cleaned source texts in kb/docs with ITU's chunk_text (only its
size and overlap parameters change), drops near-duplicates, embeds with ITU's
embed_texts, and writes <out_dir>/chunks.json and <out_dir>/vectors.json in the
same shape as the committed files, so scripts/eval_retrieval.ts --dir works on
them. Nothing here touches kb/chunks.json.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
KB = HERE.parent
ITU = pathlib.Path(__import__("os").environ.get("ITU_REPO", KB.parent.parent / "ITUAIReadiness")).resolve()
sys.path.insert(0, str(ITU / "simulation"))
sys.path.insert(0, str(KB))
from server.knowledge.ingest import chunk_text, embed_texts  # noqa: E402  (ITU code)
from clean import drop_near_duplicates  # noqa: E402

KEYS = ("title", "url", "issuer", "jurisdiction", "instrument_type", "binding", "date", "topics")


def main():
    out = pathlib.Path(sys.argv[1]); size, overlap = int(sys.argv[2]), int(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    lock = json.loads((KB / "sources.lock.json").read_text(encoding="utf-8"))
    chunks = []
    for s in json.loads((KB / "sources.json").read_text(encoding="utf-8")):
        meta = {k: s[k] for k in KEYS if k in s}
        meta["matrix_quadrants"] = s.get("matrix_quadrants", [])
        if s.get("excerpts"):  # short excerpts are one chunk each, whatever the chunk size
            for i, e in enumerate(s["excerpts"]):
                chunks.append({"chunk_id": f"{s['id']}#{i}", "source_id": s["id"], "text": f"“{e['text']}” ({e['where']})", "sha256": s["source_sha256"], **meta})
            continue
        text = (KB / "docs" / f"{s['id']}.txt").read_text(encoding="utf-8")
        for i, c in enumerate(chunk_text(text, chunk_size=size, overlap=overlap)):
            chunks.append({"chunk_id": f"{s['id']}#{i}", "source_id": s["id"], "text": c, "sha256": lock[s["id"]]["sha256"], **meta})
    chunks = drop_near_duplicates(chunks)
    (out / "chunks.json").write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")
    prefix = sys.argv[4] if len(sys.argv) > 4 else ""  # nomic expects "search_document: " on documents
    vecs = embed_texts([prefix + c["text"] for c in chunks])
    (out / "vectors.json").write_text(json.dumps({"model": "nomic-embed-text", "dim": len(vecs[0]), "ids": [c["chunk_id"] for c in chunks],
                                                  "vectors": [[round(float(x), 5) for x in v] for v in vecs]}), encoding="utf-8")
    print(f"{size}w/{overlap}: {len(chunks)} chunks -> {out}")


if __name__ == "__main__":
    main()
