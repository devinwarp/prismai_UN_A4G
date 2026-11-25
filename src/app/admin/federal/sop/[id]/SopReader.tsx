"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { DIR, tr, trN } from "@/lib/un/i18n/dict";
import { DOCUMENT_START, findSopMatches, readerOutline, readerPages, type ReaderBlock, type ReaderMatch, type ReaderText } from "@/lib/un/sop/reader";
import { useLang } from "../../_components/Lang";
import { fill } from "../../_components/labels";
import { btnGhost, btnPrimary, field } from "../../_components/ui";

const spreadSize = 2;
const resultLimit = 60;
const tool = `${btnGhost} min-h-11 px-3 py-1.5`;

function Text({ value, matches = [], active }: { value: ReaderText; matches?: ReaderMatch[]; active: number | null }) {
  let offset = 0;
  return value.runs.map((run, index) => {
    const begin = offset;
    const end = offset += run.text.length;
    const fragments: ReactNode[] = [];
    let cursor = begin;
    for (const match of matches) {
      if (match.end <= begin || match.start >= end) continue;
      const from = Math.max(begin, match.start);
      const to = Math.min(end, match.end);
      if (cursor < from) fragments.push(value.plain.slice(cursor, from));
      fragments.push(<mark key={match.id} data-match={from === match.start ? match.id : undefined} className={match.id === active ? "rounded-sm bg-ink text-paper" : "rounded-sm bg-lit-soft text-ink"}>{value.plain.slice(from, to)}</mark>);
      cursor = to;
    }
    if (cursor < end) fragments.push(value.plain.slice(cursor, end));
    if (run.style === "strong") return <strong key={index} className="font-semibold">{fragments}</strong>;
    if (run.style === "em") return <em key={index}>{fragments}</em>;
    if (run.style === "code") return <code key={index} className="rounded bg-paper-deep px-1 font-mono text-xs">{fragments}</code>;
    return <Fragment key={index}>{fragments}</Fragment>;
  });
}

function SourceBlock({ block, matches, active }: { block: ReaderBlock; matches: Map<string, ReaderMatch[]>; active: number | null }) {
  const text = (i: number) => <Text value={block.fields[i]} matches={matches.get(`${block.id}:${i}`)} active={active} />;
  switch (block.kind) {
    case "heading": {
      const Title = block.level < 3 ? "h2" : block.level === 3 ? "h3" : "h4";
      return <Title className={block.level < 3 ? "font-display mt-5 text-2xl font-medium leading-tight first:mt-0" : "font-display mt-4 text-xl font-medium leading-tight first:mt-0"}>{text(0)}</Title>;
    }
    case "quote":
      return <blockquote className="rounded-lg border border-line bg-paper-deep px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">{text(0)}</blockquote>;
    case "code":
      return <pre className="overflow-x-auto rounded-lg border border-line bg-paper-deep p-3 font-mono text-xs leading-relaxed">{text(0)}</pre>;
    case "list": {
      const List = block.start === null ? "ul" : "ol";
      return <List start={block.start ?? undefined} className={`space-y-1.5 ps-6 ${block.start === null ? "list-disc" : "list-decimal"}`}>{block.fields.map((_, i) => <li key={i} className="whitespace-pre-line">{text(i)}</li>)}</List>;
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className={`sop-reader-table text-sm leading-relaxed`}>
            <thead><tr>{block.fields.slice(0, block.columns).map((_, i) => <th key={i} scope="col">{text(i)}</th>)}</tr></thead>
            <tbody>{Array.from({ length: (block.fields.length - block.columns) / block.columns }, (_, i) => (
              <tr key={i}>{block.fields.slice(0, block.columns).map((_, col) => <td key={col}>{text((i + 1) * block.columns + col)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      );
    default:
      return <p className="whitespace-pre-line">{text(0)}</p>;
  }
}

export default function SopReader({ source, fileName }: { source: string; fileName: string }) {
  const lang = useLang();
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const railId = useId();
  const [layout, setLayout] = useState<"pages" | "scroll">("pages");
  const [page, setPage] = useState(0);
  const [railOpen, setRailOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [jump, setJump] = useState<{ page: number; block?: number; match?: number } | null>(null);
  const pages = useMemo(() => readerPages(source), [source]);
  const { headings, sectionByBlock, sectionsByPage } = useMemo(() => readerOutline(pages), [pages]);
  const matches = useMemo(() => findSopMatches(pages, query), [pages, query]);
  const byField = useMemo(() => {
    const index = new Map<string, ReaderMatch[]>();
    for (const match of matches) {
      const key = `${match.block}:${match.field}`;
      const bucket = index.get(key);
      if (bucket) bucket.push(match);
      else index.set(key, [match]);
    }
    return index;
  }, [matches]);
  const first = Math.floor(page / spreadSize) * spreadSize;
  const last = Math.min(first + spreadSize, pages.length);
  const searching = !!query.trim();
  const sections = [{ label: tr(lang, "reader.overview", "Document start"), page: 0, block: undefined }, ...headings];
  const onSpread = new Set(sectionsByPage.slice(first, last).flat());
  const currentSection = (jump?.block === undefined ? undefined : sectionByBlock.get(jump.block)) ?? sectionsByPage[page]?.[0] ?? DOCUMENT_START;

  useEffect(() => {
    if (searching || layout !== "pages" || !rail.current) return;
    const panel = rail.current;
    const current = panel.querySelector('[aria-current="location"]');
    if (!current || getComputedStyle(panel).overflowY !== "auto") return;
    const bounds = panel.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    if (item.top < bounds.top + 12) panel.scrollBy({ top: item.top - bounds.top - 12 });
    else if (item.bottom > bounds.bottom - 12) panel.scrollBy({ top: item.bottom - bounds.bottom + 12 });
  }, [currentSection, first, searching, layout]);

  const target = (next: { page: number; block?: number; match?: number }) => {
    setPage(next.page);
    setJump(next);
  };
  const stepPage = (direction: number) => {
    const next = first + direction * spreadSize;
    if (next >= 0 && next < pages.length) target({ page: next });
  };
  const pickMatch = (match: ReaderMatch) => {
    setActive(match.id);
    target({ page: match.page, block: match.block, match: match.id });
  };
  const stepMatch = (direction: number) => {
    if (!matches.length) return;
    const start = active ?? (direction > 0 ? -1 : 0);
    pickMatch(matches[(start + direction + matches.length) % matches.length]);
  };

  useEffect(() => {
    if (!jump || !root.current) return;
    const container = root.current;
    const pageNode = container.querySelector<HTMLElement>(`[data-page="${jump.page}"]`);
    const match = jump.match === undefined ? null : pageNode?.querySelector(`[data-match="${jump.match}"]`);
    const block = jump.block === undefined ? null : pageNode?.querySelector(`[data-block="${jump.block}"]`);
    if (match || block) (match ?? block)?.scrollIntoView({ block: "center" });
    else if (layout === "pages" && pageNode && getComputedStyle(pageNode).overflowY === "auto") {
      container.querySelectorAll<HTMLElement>('[data-visible="true"]').forEach((leaf) => { leaf.scrollTop = 0; });
    } else pageNode?.scrollIntoView({ block: "start" });
  }, [jump, layout]);

  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      const focused = event.target as HTMLElement | null;
      if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey || focused?.closest("input,textarea,select,[contenteditable]")) return;
      event.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  function keyPage(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    stepPage((event.key === "ArrowRight") === (DIR[lang] === "ltr") ? 1 : -1);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([source], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const count = !searching ? "" : active !== null && matches[active]
    ? fill(tr(lang, "reader.match.pos", "{a} of {n} matches"), { a: active + 1, n: matches.length })
    : fill(trN(lang, "reader.matches", "{n} matches", matches.length, "1 match"), { n: matches.length });
  const pageLabel = last === first + 1
    ? fill(tr(lang, "reader.page", "Page {p} of {n}"), { p: last, n: pages.length })
    : fill(tr(lang, "reader.pages.range", "Pages {a}–{b} of {n}"), { a: first + 1, b: last, n: pages.length });
  const resultStart = active === null ? 0 : Math.max(0, Math.min(active - 15, matches.length - resultLimit));

  return (
    <div className="sop-reader-workbench" ref={root}>
      <div className={`sop-reader-toolbar flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-line bg-paper py-3`}>
        <form role="search" aria-label={tr(lang, "reader.search", "Search this SOP")} onSubmit={(event) => { event.preventDefault(); stepMatch(1); }} className="flex min-w-0 basis-full flex-wrap items-center gap-2 desk:flex-1 desk:basis-auto">
          <label htmlFor="sop-find" className="sr-only">{tr(lang, "reader.search", "Search this SOP")}</label>
          <input ref={search} id="sop-find" type="search" value={query} maxLength={160} placeholder={tr(lang, "reader.search.hint", "Find a task ID, keyword or phrase")} onChange={(event) => { setQuery(event.target.value); setActive(null); }} onKeyDown={(event) => { if (event.key === "Enter" && event.shiftKey) { event.preventDefault(); stepMatch(-1); } }} className={`${field} mt-0 min-h-11 min-w-40 flex-1`} />
          {searching && <div className="flex flex-wrap items-center gap-2">
            <span role="status" className="text-xs tabular-nums text-ink-soft">{count}</span>
            <button type="button" className={tool} disabled={!matches.length} onClick={() => stepMatch(-1)}>{tr(lang, "reader.match.prev", "Previous match")}</button>
            <button type="submit" className={tool} disabled={!matches.length}>{tr(lang, "reader.match.next", "Next match")}</button>
          </div>}
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={tr(lang, "reader.layout", "Reading layout")} className={`sop-reader-mode-switch gap-0.5 rounded-lg border border-line bg-paper-deep p-0.5`}>
            {(["pages", "scroll"] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={layout === mode} onClick={() => { setLayout(mode); setJump({ page }); }} className="rounded-md px-3 py-2 text-sm hover:bg-card aria-pressed:bg-card aria-pressed:font-medium">
                {mode === "pages" ? tr(lang, "reader.layout.pages", "Pages") : tr(lang, "reader.layout.scroll", "Scroll")}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => window.print()} className={tool}>{tr(lang, "reader.print", "Print PDF")}</button>
          <button type="button" onClick={download} className={`${btnPrimary} min-h-11`}>{tr(lang, "reader.download", "Download SOP")}</button>
        </div>
      </div>

      <div className={`sop-reader-workspace my-4 gap-4`}>
        <aside ref={rail} className="sop-reader-rail mb-3 rounded-xl border border-line bg-paper-deep p-3 desk:mb-0" data-open={railOpen}>
          <button type="button" className={`sop-reader-rail-toggle ${tool} w-full justify-start`} aria-expanded={railOpen} aria-controls={railId} onClick={() => setRailOpen(!railOpen)}>
            {searching ? tr(lang, "reader.results", "Search results") : tr(lang, "reader.contents", "Contents")}
          </button>
          <div id={railId} className={`sop-reader-rail-body mt-3 desk:mt-0`}>
            {searching && layout === "pages" && (
              <div className="mb-3 hidden border-b border-line px-2 pb-3 desk:block">
                <p className="mb-1 text-xs font-medium text-ink-soft">{tr(lang, "reader.sections.current", "Sections on these pages")}</p>
                <ul className="space-y-1 text-sm">{sections.filter((section) => onSpread.has(section.block ?? DOCUMENT_START)).map((section) => (
                  <li key={section.block ?? DOCUMENT_START} dir="auto">{section.label}</li>
                ))}</ul>
              </div>
            )}
            <h2 className="mb-2 hidden px-2 text-sm font-semibold desk:block">{searching ? tr(lang, "reader.results", "Search results") : tr(lang, "reader.contents", "Contents")}</h2>
            {searching ? (
              matches.length ? (
                <ol className="max-h-72 space-y-1 overflow-y-auto desk:max-h-none">
                  {matches.slice(resultStart, resultStart + resultLimit).map((match) => (
                    <li key={match.id}>
                      <button type="button" aria-current={active === match.id ? "true" : undefined} onClick={() => { setRailOpen(false); pickMatch(match); }} className="w-full min-w-0 rounded-lg px-2 py-2 text-start text-sm leading-snug break-words hover:bg-card aria-current:bg-card">
                        <span className="block text-xs text-ink-soft">{fill(tr(lang, "reader.page.short", "Page {p}"), { p: match.page + 1 })}</span>
                        {match.start > 35 && "…"}{match.text.slice(Math.max(0, match.start - 35), match.start)}
                        <mark className="bg-lit-soft font-medium text-ink">{match.text.slice(match.start, match.end)}</mark>
                        {match.text.slice(match.end, match.end + 55)}{match.end + 55 < match.text.length && "…"}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <p className="px-2 text-sm text-ink-soft">{tr(lang, "reader.no.matches", "No matches. Try a shorter term or a task ID.")}</p>
            ) : (
              <nav aria-label={tr(lang, "reader.contents", "Contents")} className="max-h-72 overflow-y-auto desk:max-h-none">
                <ol className="space-y-1">
                  {sections.map((section) => {
                    const id = section.block ?? DOCUMENT_START;
                    return (
                      <li key={id}>
                        <button type="button" aria-current={layout === "pages" && id === currentSection ? "location" : undefined} data-on-spread={layout === "pages" && onSpread.has(id) ? "true" : undefined} onClick={() => { setRailOpen(false); target(section); }} className="flex w-full items-baseline justify-between gap-3 rounded-lg border-s-2 border-transparent px-2 py-2 text-start text-sm leading-snug hover:bg-card desk:data-[on-spread=true]:bg-card desk:aria-current:border-lit desk:aria-current:font-semibold">
                          <span dir="auto">{section.label}</span>
                          <span className="hidden shrink-0 text-xs tabular-nums text-ink-soft desk:inline">{section.page + 1}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            )}
          </div>
        </aside>

        <div className={`sop-reader-reading-area overflow-hidden rounded-xl border border-line bg-card`}>
          <div className="sop-reader-pages" data-layout={layout}>
            {pages.map((blocks, i) => (
              <article key={i} data-page={i} data-visible={i >= first && i < last} data-side={i % spreadSize === 0 ? "first" : "last"} aria-label={fill(tr(lang, "reader.page.short", "Page {p}"), { p: i + 1 })} className="sop-reader-leaf min-w-0 border-b border-line px-5 py-6 last:border-b-0 sm:px-8 sm:py-7 desk:px-6 desk:py-5">
                <div className="space-y-3.5 text-base leading-relaxed break-words desk:text-sm desk:leading-relaxed" dir="auto">
                  {blocks.map((block) => <div key={block.id} data-block={block.id}><SourceBlock block={block} matches={byField} active={active} /></div>)}
                </div>
                <p className={`sop-reader-page-number pt-4 text-center font-mono text-xs tabular-nums text-ink-soft`}>{i + 1}</p>
              </article>
            ))}
          </div>
          <nav data-layout={layout} className={`sop-reader-pagination shrink-0 items-center justify-between gap-3 border-t border-line bg-paper px-4 py-2`} aria-label={tr(lang, "reader.page.nav", "Document pages")}>
            <button type="button" className={tool} disabled={first === 0} onClick={() => stepPage(-1)} onKeyDown={keyPage}>{tr(lang, "reader.pages.prev", "Previous pages")}</button>
            <p role="status" className="text-sm tabular-nums text-ink-soft">{pageLabel}</p>
            <button type="button" className={tool} disabled={last === pages.length} onClick={() => stepPage(1)} onKeyDown={keyPage}>{tr(lang, "reader.pages.next", "Next pages")}</button>
          </nav>
        </div>
      </div>
    </div>
  );
}
