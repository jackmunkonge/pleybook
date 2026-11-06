export type Segment = {
  clauseRef: string | null;
  sectionPath: string[];
  heading: string | null;
  /** Always equals source.slice(charStart, charEnd). */
  text: string;
  charStart: number;
  charEnd: number;
};

type Line = { text: string; start: number; end: number };

type Marker = {
  line: number;
  ref: string;
  level: number;
  heading: string | null;
  lettered: boolean;
};

export const MIN_CLAUSE_CHARS = 40;
const MAX_HEADING_CHARS = 80;

const ROMAN = /^[IVXLC]+$/;

function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  let pos = 0;
  for (const raw of source.split("\n")) {
    lines.push({ text: raw, start: pos, end: pos + raw.length });
    pos += raw.length + 1;
  }
  return lines;
}

function headingFrom(rest: string): string | null {
  const t = rest.replace(/^[.:\-–—\s]+/, "").trim();
  if (!t || t.length > MAX_HEADING_CHARS || /[.;,]$/.test(t)) return null;
  return t;
}

/** Detect a clause marker on one line. `parent` supplies the base for lettered sub-clauses. */
function detect(line: string, parent: Marker | undefined): Omit<Marker, "line"> | null {
  const t = line.trim();
  if (!t) return null;

  let m = /^ARTICLE\s+([IVXLC]+|\d+)\b(.*)$/i.exec(t);
  if (m && (ROMAN.test(m[1].toUpperCase()) || /^\d+$/.test(m[1]))) {
    return { ref: `Article ${m[1].toUpperCase()}`, level: 1, heading: headingFrom(m[2]), lettered: false };
  }

  m = /^Section\s+(\d+(?:\.\d+)*)\b\.?(.*)$/i.exec(t);
  if (m) {
    return { ref: m[1], level: m[1].split(".").length, heading: headingFrom(m[2]), lettered: false };
  }

  m = /^(\d{1,2}(?:\.\d{1,2})*)\.?\s+(\S.*)$/.exec(t);
  if (m && /^[A-Z"“(]/.test(m[2])) {
    return { ref: m[1], level: m[1].split(".").length, heading: headingFrom(m[2]), lettered: false };
  }

  m = /^\(([a-z]{1,2}|[ivx]+)\)\s+(\S.*)$/.exec(t);
  if (m && parent) {
    const base = parent.lettered ? parent.ref.replace(/\([^)]*\)$/, "") : parent.ref;
    const baseLevel = parent.lettered ? parent.level - 1 : parent.level;
    return { ref: `${base}(${m[1]})`, level: baseLevel + 1, heading: null, lettered: true };
  }
  return null;
}

/** Split contract text into clauses on numbered/lettered/article headings. */
export function segment(source: string): Segment[] {
  const lines = splitLines(source);

  const markers: Marker[] = [];
  for (let i = 0; i < lines.length; i++) {
    const d = detect(lines[i].text, markers[markers.length - 1]);
    if (d) markers.push({ line: i, ...d });
  }

  type Draft = Segment & { level: number; title: string | null };
  const drafts: Draft[] = [];

  const firstStart = markers.length ? lines[markers[0].line].start : source.length;
  const preamble = trimRange(source, 0, firstStart);
  if (preamble) {
    drafts.push({
      clauseRef: null, sectionPath: ["Preamble"], heading: "Preamble",
      text: source.slice(preamble[0], preamble[1]), charStart: preamble[0], charEnd: preamble[1],
      level: 0, title: "Preamble",
    });
  }

  markers.forEach((mk, i) => {
    const start = lines[mk.line].start;
    const rawEnd = i + 1 < markers.length ? lines[markers[i + 1].line].start : source.length;
    const range = trimRange(source, start, rawEnd);
    if (!range) return;
    drafts.push({
      clauseRef: mk.ref, sectionPath: [], heading: mk.heading,
      text: source.slice(range[0], range[1]), charStart: range[0], charEnd: range[1],
      level: mk.level, title: mk.heading,
    });
  });

  // section_path: ancestors by level, as "ref heading" labels.
  const stack: { level: number; label: string }[] = [];
  for (const d of drafts) {
    if (d.clauseRef === null) continue;
    while (stack.length && stack[stack.length - 1].level >= d.level) stack.pop();
    stack.push({ level: d.level, label: [d.clauseRef, d.title].filter(Boolean).join(" ") });
    d.sectionPath = stack.map((s) => s.label);
  }

  // Fragment handling: short clauses are either pure parents (dropped, they live on in
  // section_path) or get merged into the preceding clause.
  const out: Draft[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    if (d.text.length >= MIN_CLAUSE_CHARS) { out.push(d); continue; }
    const next = drafts[i + 1];
    if (next && next.level > d.level && d.clauseRef !== null) continue;
    const prev = out[out.length - 1];
    if (prev) {
      prev.charEnd = d.charEnd;
      prev.text = source.slice(prev.charStart, prev.charEnd);
    } else {
      out.push(d);
    }
  }

  return out.map((d) => ({
    clauseRef: d.clauseRef, sectionPath: d.sectionPath, heading: d.heading,
    text: d.text, charStart: d.charStart, charEnd: d.charEnd,
  }));
}

function trimRange(source: string, start: number, end: number): [number, number] | null {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(source[s])) s++;
  while (e > s && /\s/.test(source[e - 1])) e--;
  return e > s ? [s, e] : null;
}
