import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { PaperMeta } from "@/lib/api";
import { BANK_QUERY } from "@/lib/query-client";
import type { ReviewedQuestion } from "@/lib/review";

export interface BankEntry {
  key: string;
  meta: PaperMeta;
  question: ReviewedQuestion;
  /** Position inside its paper, for "paper order" sorting. */
  order: number;
  /** Lower-case plain text of everything searchable (question, options, answer, topic, keywords). */
  search: string;
}

/**
 * All published questions (from the database, the same for every student).
 * Filtering and search happen in the browser for now; with a very large bank this moves to a
 * server query (GET /bank?filters) and the filter UI stays the same.
 */
export function useQuestionBank() {
  const bank = useQuery(BANK_QUERY);
  const entries = useMemo<BankEntry[]>(
    () =>
      (bank.data ?? []).map(({ meta, question, order }) => ({
        key: `${meta.id}/${question.id}`,
        meta,
        question,
        order,
        search: searchText(meta, question),
      })),
    [bank.data],
  );
  return { entries, isLoading: bank.isPending, error: bank.error ?? null };
}

// ---------------- search

/** LaTeX / Markdown to plain words: "$R_{\text{min}} = 2\,\Omega$" -> "r min = 2 omega". */
export function plain(s: string): string {
  return s
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^}]*)\}/g, " $1 ")
    .replace(/\\([a-zA-Z]+)/g, " $1 ")
    .replace(/[{}$^_\\|*#>`~]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function searchText(meta: PaperMeta, q: ReviewedQuestion): string {
  return plain(
    [
      q.text,
      ...q.options.map((o) => o.text),
      q.topic,
      q.subtopic,
      q.subtopicDetail ?? "",
      ...q.keywords,
      q.answer?.text ?? "",
      `${meta.year} ${meta.seasonName} paper ${meta.paperCode} q${q.number}`,
    ].join(" \n "),
  );
}

/** Every word of the query must appear (in any order). */
function matchesSearch(e: BankEntry, words: string[]): boolean {
  for (const w of words) if (!e.search.includes(w)) return false;
  return true;
}

export function searchWords(q: string): string[] {
  return plain(q).split(" ").filter(Boolean);
}

// ---------------- filters

export interface Filters {
  board: string | null;
  /** Level = curriculum, e.g. "Edexcel AS Level". */
  level: string | null;
  /** Course = subject code (each subject belongs to one board + level). */
  course: string | null;
  q: string;
  /** Whole topics (by name). */
  topic: string[];
  /** Single subtopics, as subKey(topic, subtopic). */
  sub: string[];
  yearFrom: number | null;
  yearTo: number | null;
  paper: string[];
  season: string[];
  type: string[];
  difficulty: string[];
}

export type MultiKey = "paper" | "season" | "type" | "difficulty";
type SkipKey = MultiKey | "board" | "level" | "course" | "topic" | "year";

export const EMPTY_FILTERS: Filters = { board: null, level: null, course: null, q: "", topic: [], sub: [], yearFrom: null, yearTo: null, paper: [], season: [], type: [], difficulty: [] };

const SEASON_ORDER: Record<string, number> = { j: 0, m: 1, s: 2, w: 3, x: 4 };

export const subKey = (topic: string, subtopic: string) => `${topic}\u001f${subtopic}`;
export const splitSubKey = (key: string) => {
  const [topic, subtopic = ""] = key.split("\u001f");
  return { topic, subtopic };
};

const facetValue: Record<MultiKey, (e: BankEntry) => string> = {
  paper: (e) => String(e.meta.paperNumber ?? e.meta.paperCode),
  season: (e) => e.meta.seasonCode,
  type: (e) => (e.question.type === "MCQ" ? "MCQ" : "WRITTEN"),
  difficulty: (e) => e.question.difficulty,
};

function matches(e: BankEntry, f: Filters, words: string[], skip?: SkipKey): boolean {
  if (skip !== "board" && f.board && e.meta.board !== f.board) return false;
  if (skip !== "level" && f.level && e.meta.curriculum !== f.level) return false;
  if (skip !== "course" && f.course && e.meta.subjectCode !== f.course) return false;
  if (skip !== "topic" && (f.topic.length || f.sub.length)) {
    if (!f.topic.includes(e.question.topic) && !f.sub.includes(subKey(e.question.topic, e.question.subtopic))) return false;
  }
  if (skip !== "year") {
    if (f.yearFrom != null && e.meta.year < f.yearFrom) return false;
    if (f.yearTo != null && e.meta.year > f.yearTo) return false;
  }
  for (const k of Object.keys(facetValue) as MultiKey[]) {
    if (k === skip || f[k].length === 0) continue;
    if (!f[k].includes(facetValue[k](e))) return false;
  }
  return words.length === 0 || matchesSearch(e, words);
}

export function filterEntries(entries: BankEntry[], f: Filters): BankEntry[] {
  const words = searchWords(f.q);
  return entries.filter((e) => matches(e, f, words));
}

// ---------------- facets

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface TopicNode {
  topic: string;
  label: string;
  count: number;
  subs: { key: string; name: string; count: number }[];
}

function codeKey(code: string | null | undefined): number[] {
  return (code ?? "").split(".").map((n) => (Number.isFinite(parseFloat(n)) ? parseFloat(n) : 999));
}
function compareCodes(a: string | null | undefined, b: string | null | undefined): number {
  const x = codeKey(a);
  const y = codeKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

/** Options for each filter, counted against all OTHER active filters (so counts show what you'd get). */
export function buildFacets(entries: BankEntry[], f: Filters) {
  const words = searchWords(f.q);

  const count = (skip: SkipKey, value: (e: BankEntry) => string, label: (e: BankEntry) => string) => {
    const map = new Map<string, FacetOption>();
    for (const e of entries) {
      if (!matches(e, f, words, skip)) continue;
      const v = value(e);
      const hit = map.get(v);
      if (hit) hit.count++;
      else map.set(v, { value: v, label: label(e), count: 1 });
    }
    return map;
  };
  // Keep selected values visible even when they have 0 results now.
  const withSelected = (map: Map<string, FacetOption>, selected: string[], label: (v: string) => string) => {
    for (const v of selected) if (!map.has(v)) map.set(v, { value: v, label: label(v), count: 0 });
    return [...map.values()];
  };

  // Board / level: only ones with published questions
  const sortOpts = (m: Map<string, FacetOption>) => [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const boards = sortOpts(count("board", (e) => e.meta.board, (e) => e.meta.board));
  const levels = sortOpts(count("level", (e) => e.meta.curriculum, (e) => e.meta.curriculum));
  const subjects = sortOpts(count("course", (e) => e.meta.subjectCode, (e) => `${e.meta.subjectName} (${e.meta.subjectCode})`));

  // Topic tree (topics -> syllabus subtopics)
  const topicMap = new Map<string, TopicNode & { code: string | null; subCodes: Map<string, string | null> }>();
  const inCourse = (e: BankEntry) => !f.course || e.meta.subjectCode === f.course;
  for (const e of entries) {
    if (!inCourse(e)) continue;
    const q = e.question;
    let node = topicMap.get(q.topic);
    if (!node) {
      node = { topic: q.topic, label: q.topicCode ? `${q.topicCode}. ${q.topic}` : q.topic, count: 0, subs: [], code: q.topicCode, subCodes: new Map() };
      topicMap.set(q.topic, node);
    }
    if (q.subtopic && !node.subCodes.has(q.subtopic)) node.subCodes.set(q.subtopic, q.subtopicCode ?? null);
  }
  const subCounts = new Map<string, number>();
  for (const e of entries) {
    if (!matches(e, f, words, "topic")) continue;
    const node = topicMap.get(e.question.topic);
    if (!node) continue;
    node.count++;
    if (e.question.subtopic) {
      const k = subKey(e.question.topic, e.question.subtopic);
      subCounts.set(k, (subCounts.get(k) ?? 0) + 1);
    }
  }
  const topics: TopicNode[] = [...topicMap.values()]
    .sort((a, b) => compareCodes(a.code, b.code) || a.topic.localeCompare(b.topic))
    .map((n) => ({
      topic: n.topic,
      label: n.label,
      count: n.count,
      subs: [...n.subCodes.entries()]
        .sort(([an, ac], [bn, bc]) => compareCodes(ac, bc) || an.localeCompare(bn))
        .map(([name]) => ({ key: subKey(n.topic, name), name, count: subCounts.get(subKey(n.topic, name)) ?? 0 })),
    }));

  // Years: bounds from the whole course, counts against the other filters
  const courseYears = entries.filter(inCourse).map((e) => e.meta.year);
  const yearBounds = courseYears.length ? { min: Math.min(...courseYears), max: Math.max(...courseYears) } : null;
  const yearCounts = count("year", (e) => String(e.meta.year), (e) => String(e.meta.year));

  const papers = withSelected(
    count("paper", facetValue.paper, (e) => `Paper ${e.meta.paperNumber ?? e.meta.paperCode}${e.meta.componentName ? ` · ${e.meta.componentName}` : ""}`),
    f.paper,
    (v) => `Paper ${v}`,
  ).sort((a, b) => Number(a.value) - Number(b.value));
  const seasons = withSelected(count("season", facetValue.season, (e) => e.meta.seasonName), f.season, (v) => v).sort(
    (a, b) => (SEASON_ORDER[a.value] ?? 9) - (SEASON_ORDER[b.value] ?? 9),
  );
  const types = withSelected(count("type", facetValue.type, (e) => (e.question.type === "MCQ" ? "MCQ" : "Written")), f.type, (v) => v).sort((a) =>
    a.value === "MCQ" ? -1 : 1,
  );
  const difficulties = withSelected(count("difficulty", facetValue.difficulty, (e) => e.question.difficulty), f.difficulty, (v) => v);

  return { boards, levels, subjects, topics, yearBounds, yearCounts, papers, seasons, types, difficulties };
}

export type Facets = ReturnType<typeof buildFacets>;

// ---------------- sorting

export type SortKey = "newest" | "oldest" | "topic";

export function sortEntries(entries: BankEntry[], sort: SortKey): BankEntry[] {
  const byPaper = (a: BankEntry, b: BankEntry) =>
    b.meta.year - a.meta.year ||
    (SEASON_ORDER[b.meta.seasonCode] ?? 0) - (SEASON_ORDER[a.meta.seasonCode] ?? 0) ||
    a.meta.paperCode.localeCompare(b.meta.paperCode) ||
    a.order - b.order;
  const sorted = [...entries];
  if (sort === "newest") sorted.sort(byPaper);
  if (sort === "oldest") sorted.sort((a, b) => -byPaper(a, b) || a.order - b.order);
  if (sort === "topic")
    sorted.sort(
      (a, b) =>
        compareCodes(a.question.topicCode, b.question.topicCode) ||
        a.question.topic.localeCompare(b.question.topic) ||
        compareCodes(a.question.subtopicCode, b.question.subtopicCode) ||
        byPaper(a, b),
    );
  return sorted;
}

// ---------------- URL <-> filters

const MULTI_KEYS: MultiKey[] = ["paper", "season", "type", "difficulty"];
const COURSE_KEY = "pa.course";

/** The course picked last time on this device (used when the link has no course). */
export function rememberedCourse(): string | null {
  try {
    return localStorage.getItem(COURSE_KEY);
  } catch {
    return null;
  }
}
export function rememberCourse(course: string | null) {
  try {
    if (course) localStorage.setItem(COURSE_KEY, course);
    else localStorage.removeItem(COURSE_KEY);
  } catch {
    // private mode
  }
}

export function filtersFromParams(params: URLSearchParams): Filters {
  const list = (k: string) => params.getAll(k).filter(Boolean);
  const num = (k: string) => {
    const n = Number(params.get(k));
    return params.get(k) && Number.isFinite(n) ? n : null;
  };
  // Older links: ?subject=8PH0 and ?year=2024
  const years = list("year").map(Number).filter(Number.isFinite);
  return {
    board: params.get("board"),
    level: params.get("level"),
    course: params.get("course") ?? params.get("subject") ?? (params.toString() ? null : rememberedCourse()),
    q: params.get("q") ?? "",
    topic: list("topic"),
    sub: list("sub"),
    yearFrom: num("yf") ?? (years.length ? Math.min(...years) : null),
    yearTo: num("yt") ?? (years.length ? Math.max(...years) : null),
    paper: list("paper"),
    season: list("season"),
    type: list("type"),
    difficulty: list("difficulty"),
  };
}

export function filtersToParams(f: Filters, sort: SortKey): URLSearchParams {
  const p = new URLSearchParams();
  if (f.board) p.set("board", f.board);
  if (f.level) p.set("level", f.level);
  if (f.course) p.set("course", f.course);
  if (f.q.trim()) p.set("q", f.q.trim());
  for (const v of f.topic) p.append("topic", v);
  for (const v of f.sub) p.append("sub", v);
  if (f.yearFrom != null) p.set("yf", String(f.yearFrom));
  if (f.yearTo != null) p.set("yt", String(f.yearTo));
  for (const k of MULTI_KEYS) for (const v of f[k]) p.append(k, v);
  if (sort !== "newest") p.set("sort", sort);
  return p;
}

/** Filters set in the side panel (search has its own box). */
export function activeFilterCount(f: Filters): number {
  return (f.board ? 1 : 0) + (f.level ? 1 : 0) + (f.course ? 1 : 0) + f.topic.length + f.sub.length + (f.yearFrom != null || f.yearTo != null ? 1 : 0) + MULTI_KEYS.reduce((n, k) => n + f[k].length, 0);
}
