"""Build the knowledge base with ITU's reference pipeline.

ITU's parse_file, chunk_text, embed_texts and KnowledgeBase functions are imported
unchanged from https://github.com/CrashingGuru/ITUAIReadiness (simulation/server/knowledge,
pinned in kb/sources.json). The HTML cleaning is ours; the web app does not use
the embeddings at runtime yet (retrieval is BM25 until C1-6).
This script adds only: a source manifest, SHA-256 provenance, clause-level chunk
ids, and a chunks.json export that the Next.js app retrieves from.

    git clone https://github.com/CrashingGuru/ITUAIReadiness ../ITUAIReadiness
    pip install -r kb/requirements.txt
    python kb/build.py            # fetch, extract, chunk -> kb/chunks.json
    python kb/build.py --embed    # also embed (Ollama nomic-embed-text) into kb/chroma

Env: ITU_REPO (default ../ITUAIReadiness). Blocked sources: drop their text in
kb/manual/<id>.txt and re-run.
"""
import argparse, hashlib, json, os, re, sys, unicodedata, urllib.request
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
ITU = Path(os.environ.get("ITU_REPO", HERE.parent.parent / "ITUAIReadiness")).resolve()
sys.path.insert(0, str(ITU / "simulation"))
from server.knowledge.ingest import chunk_text, parse_file  # noqa: E402  (ITU code)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from clean import drop_near_duplicates, strip_boilerplate  # noqa: E402  (ours, C1-4)

SKIP = {"script", "style", "nav", "header", "footer", "noscript", "svg", "form", "aside"}
BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "tr", "br", "section", "article"}


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, _):
        if tag in SKIP: self.skip += 1
        if tag in BLOCK: self.out.append("\n\n")

    def handle_endtag(self, tag):
        if tag in SKIP and self.skip: self.skip -= 1

    def handle_data(self, data):
        if not self.skip and data.strip(): self.out.append(data.strip() + " ")


def html_text(raw: bytes) -> str:
    p = Text()
    p.feed(raw.decode("utf-8", errors="replace"))
    t = re.sub(r"[ \t]+", " ", "".join(p.out))
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def clean(t: str) -> str:
    """PDF text fixes: the UAE Charter font maps the 'Th' ligature to U+0407, and
    ligatures (fi, fl) come out as single glyphs. NFKC folds the latter."""
    return unicodedata.normalize("NFKC", t.replace("\u0407", "Th"))


def fetch(url: str) -> bytes:
    # Some government sites 403 non-browser clients; send ordinary browser headers.
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--embed", action="store_true")
    args = ap.parse_args()
    (HERE / "raw").mkdir(exist_ok=True)
    (HERE / "docs").mkdir(exist_ok=True)
    lock, chunks, skipped = {}, [], []
    for s in json.loads((HERE / "sources.json").read_text(encoding="utf-8")):
        sid = s["id"]
        manual = HERE / "manual" / f"{sid}.txt"
        if s.get("excerpts"):
            # Short quoted excerpts (each at most 40 words) with the source URL: used for documents
            # we may not redistribute in full. The full text is never read or stored here.
            meta = {k: s[k] for k in ("title", "url", "issuer", "jurisdiction", "instrument_type", "binding", "date", "topics") if k in s}
            meta["matrix_quadrants"] = s.get("matrix_quadrants", [])
            for i, e in enumerate(s["excerpts"]):
                assert len(e["text"].split()) <= 40, f"{sid}: excerpt over 40 words: {e['text'][:40]}"
                chunks.append({"chunk_id": f"{sid}#{i}", "source_id": sid, "text": f"“{e['text']}” ({e['where']})", "sha256": s["source_sha256"], **meta, **({"section": e["section"]} if e.get("section") else {})})
            lock[sid] = {"sha256": s["source_sha256"], "bytes": 0, "chars": sum(len(e["text"]) for e in s["excerpts"])}
            continue
        try:
            if s.get("local") or s.get("file"):
                # "local": a file in the ITU repo's InputDocs; "file": a file under kb/ (kb/local/ is gitignored)
                path = (ITU / "simulation/server/knowledge/InputDocs" / s["local"]) if s.get("local") else (HERE / s["file"])
                raw = path.read_bytes()
                text = clean(parse_file(path)) if path.suffix.lower() == ".pdf" else raw.decode("utf-8", errors="replace")
            elif manual.exists():
                raw = manual.read_bytes()
                text = raw.decode("utf-8", errors="replace")
            else:
                cache = HERE / "raw" / sid
                if not cache.exists(): cache.write_bytes(fetch(s["url"]))
                raw = cache.read_bytes()
                if raw[:4] == b"%PDF":
                    text = clean(parse_file(cache.with_suffix(".pdf") if cache.with_suffix(".pdf").exists() else _pdf(cache)))
                else:
                    text = html_text(raw)
        except Exception as e:
            skipped.append((sid, str(e)[:80])); continue
        if len(text) < 300:
            skipped.append((sid, "extracted text too short")); continue
        text = strip_boilerplate(text)
        (HERE / "docs" / f"{sid}.txt").write_text(text, encoding="utf-8")
        sha = hashlib.sha256(raw).hexdigest()
        lock[sid] = {"sha256": sha, "bytes": len(raw), "chars": len(text)}
        meta = {k: s[k] for k in ("title", "url", "issuer", "jurisdiction", "instrument_type", "binding", "date", "topics") if k in s}
        meta["matrix_quadrants"] = s.get("matrix_quadrants", [])
        for i, c in enumerate(chunk_text(text)):  # ITU chunker: ~256 words, 30 overlap
            chunks.append({"chunk_id": f"{sid}#{i}", "source_id": sid, "text": c, "sha256": sha, **meta})
    chunks = drop_near_duplicates(chunks)
    (HERE / "sources.lock.json").write_text(json.dumps(lock, indent=1), encoding="utf-8")
    (HERE / "chunks.json").write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")
    print(f"{len(lock)} sources, {len(chunks)} chunks -> kb/chunks.json")
    for sid, why in skipped: print(f"  SKIPPED {sid}: {why}")
    if args.embed:
        from server.knowledge.ingest import embed_texts
        from server.knowledge.kb import KnowledgeBase
        kb = KnowledgeBase(persist_dir=str(HERE / "chroma"))
        flat = lambda c: {k: (json.dumps(v) if isinstance(v, (list, bool, type(None))) else str(v)) for k, v in c.items() if k != "text"}
        vecs = embed_texts([c["text"] for c in chunks])  # embed once, use for Chroma and vectors.json
        kb.add_documents(texts=[c["text"] for c in chunks], embeddings=vecs,
                         metadatas=[flat(c) for c in chunks], ids=[c["chunk_id"] for c in chunks])
        print("embedded into kb/chroma")
        # Vectors for the web app (C1-6): ITU's embed_texts output, committed beside chunks.json
        # and scored in memory at runtime (src/lib/un/vector.ts). Same order and ids as chunks.json.
        (HERE / "vectors.json").write_text(json.dumps({
            "model": "nomic-embed-text", "dim": len(vecs[0]), "ids": [c["chunk_id"] for c in chunks],
            "vectors": [[round(float(x), 5) for x in v] for v in vecs]}), encoding="utf-8")
        print(f"wrote kb/vectors.json ({len(vecs)} x {len(vecs[0])})")


def _pdf(cache: Path) -> Path:
    p = cache.with_suffix(".pdf"); p.write_bytes(cache.read_bytes()); return p


if __name__ == "__main__":
    main()
