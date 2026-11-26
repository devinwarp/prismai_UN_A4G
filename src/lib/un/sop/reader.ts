export type TextRun = { text: string; style?: "strong" | "em" | "code" };
export type ReaderText = { plain: string; runs: TextRun[] };

type Block =
  | { kind: "heading"; level: number; fields: ReaderText[] }
  | { kind: "paragraph" | "quote" | "code"; fields: ReaderText[] }
  | { kind: "list"; start: number | null; fields: ReaderText[] }
  | { kind: "table"; columns: number; repeatedHeader: boolean; fields: ReaderText[] };

export type ReaderBlock = Block & { id: number };
export type ReaderPage = ReaderBlock[];
export type ReaderMatch = { id: number; page: number; block: number; field: number; start: number; end: number; text: string };
export const DOCUMENT_START = -1;

/** A page can continue one section and start another. Keep every section represented on it. */
export function readerOutline(pages: ReaderPage[]) {
  const headings: { page: number; block: number; label: string }[] = [];
  const sectionByBlock = new Map<number, number>();
  let section = DOCUMENT_START;
  const sectionsByPage = pages.map((blocks, page) => {
    const onPage = new Set<number>();
    for (const block of blocks) {
      if (block.kind === "heading" && block.level === 2) {
        section = block.id;
        headings.push({ page, block: block.id, label: block.fields[0].plain });
      }
      sectionByBlock.set(block.id, section);
      onPage.add(section);
    }
    return [...onPage];
  });
  return { headings, sectionByBlock, sectionsByPage };
}

function inline(raw: string): ReaderText {
  const runs: TextRun[] = [];
  let cursor = 0;
  for (const match of raw.matchAll(/\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*/g)) {
    if (match.index > cursor) runs.push({ text: raw.slice(cursor, match.index) });
    runs.push(match[1] ? { text: match[1], style: "strong" } : match[2] ? { text: match[2], style: "code" } : { text: match[3], style: "em" });
    cursor = match.index + match[0].length;
  }
  if (cursor < raw.length) runs.push({ text: raw.slice(cursor) });
  return { plain: runs.map((run) => run.text).join(""), runs };
}

const heading = /^(#{1,6})\s+(.+?)\s*#*$/;
const listItem = /^(?:[-+*]|(\d+)[.)])\s+(.+)$/;
const fence = /^(?:`{3,}|~{3,})/;
const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll("\\|", "|"));
const isTable = (head: string, rule = "") => head.includes("|") && rule.includes("|") && cells(rule).every((cell) => /^:?-{3,}:?$/.test(cell));
const lineWeight = (text: ReaderText, width = 62) =>
  text.plain.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / width)), 0);

/** Parse the text and Markdown structures used by SOPs. All content stays text, including any HTML. */
export function readerPages(source: string): ReaderPage[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimEnd());
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const h = heading.exec(line);
    const item = listItem.exec(line);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length, fields: [inline(h[2])] });
      i++;
    } else if (fence.test(line)) {
      const marker = line[0];
      const code: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^${marker}{3,}\\s*$`).test(lines[i].trim())) code.push(lines[i++]);
      if (i < lines.length) i++;
      const text = code.join("\n");
      blocks.push({ kind: "code", fields: [{ plain: text, runs: [{ text }] }] });
    } else if (isTable(line, lines[i + 1])) {
      const head = cells(line).map(inline);
      i += 2;
      const rows: ReaderText[][] = [];
      while (i < lines.length && lines[i].includes("|") && !heading.test(lines[i].trim())) {
        const row = cells(lines[i]);
        if (row.length !== head.length) break;
        rows.push(row.map(inline));
        i++;
      }
      const batchSize = Math.ceil(Math.max(1, rows.length) / Math.max(1, Math.ceil(rows.length / 5)));
      for (let start = 0; start < Math.max(1, rows.length); start += batchSize) {
        blocks.push({ kind: "table", columns: head.length, repeatedHeader: start > 0, fields: [...head, ...rows.slice(start, start + batchSize).flat()] });
      }
    } else if (item) {
      const start = item[1] ? Number(item[1]) : null;
      const fields: ReaderText[] = [];
      let next: RegExpExecArray | null;
      while (i < lines.length && (next = listItem.exec(lines[i].trim())) && Boolean(next[1]) === (start !== null)) {
        const text = [next[2]];
        i++;
        while (i < lines.length && /^ {2,}\S/.test(lines[i]) && !listItem.test(lines[i].trim())) text.push(lines[i++].trim());
        fields.push(inline(text.join("\n")));
      }
      blocks.push({ kind: "list", start, fields });
    } else if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) quote.push(lines[i++].trimStart().replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", fields: [inline(quote.join("\n"))] });
    } else {
      const paragraph = [line];
      i++;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next || heading.test(next) || fence.test(next) || listItem.test(next) || next.startsWith(">") || isTable(next, lines[i + 1])) break;
        paragraph.push(next);
        i++;
      }
      blocks.push({ kind: "paragraph", fields: [inline(paragraph.join("\n"))] });
    }
  }

  const weight = (block: Block) => {
    if (block.kind === "heading") return block.level < 3 ? 3 : 2;
    if (block.kind === "table") {
      let rows = 1;
      for (let i = 0; i < block.fields.length; i += block.columns) {
        rows += 1 + Math.max(...block.fields.slice(i, i + block.columns).map((field) => lineWeight(field, block.columns === 2 ? 45 : 27)));
      }
      return rows;
    }
    return 1 + block.fields.reduce((sum, field) => sum + lineWeight(field), 0);
  };

  const pages: ReaderPage[] = [];
  let page: ReaderPage = [];
  let used = 0;
  blocks.forEach((block, id) => {
    const size = weight(block);
    const next = blocks[id + 1];
    const withNext = block.kind === "heading" && next ? Math.min(24, size + weight(next)) : size;
    if (page.length && used + withNext > 24 && page.at(-1)?.kind !== "heading") {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push({ ...block, id });
    used += size;
  });
  if (page.length) pages.push(page);
  return pages;
}

/** Find literal, case-insensitive matches in the visible text, independent of the current spread. */
export function findSopMatches(pages: ReaderPage[], input: string): ReaderMatch[] {
  const query = input.trim();
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const pattern = new RegExp(escaped, "giu");
  const matches: ReaderMatch[] = [];
  pages.forEach((blocks, page) => blocks.forEach((block) => block.fields.forEach(({ plain }, field) => {
    if (block.kind === "table" && block.repeatedHeader && field < block.columns) return;
    for (const match of plain.matchAll(pattern)) {
      matches.push({ id: matches.length, page, block: block.id, field, start: match.index, end: match.index + match[0].length, text: plain });
    }
  })));
  return matches;
}
