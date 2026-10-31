import type { PaperMeta } from "@/lib/api";
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



export function searchWords(q: string): string[] {
  return plain(q).split(" ").filter(Boolean);
}

// ---------------- filters

export interface Filters {
  /** Curricula (boards) by name; several can be ticked. */
  board: string[];
  /** General levels, the same across boards: "AS Level", "A Level", "International A Level". */
  level: string[];
  /** Subjects by name ("Physics": every board's Physics); older links give a syllabus code ("8PH0"). */
  course: string[];
  q: string;
  /** Whole topics (by name). */
  topic: string[];
  /** Single subtopics, as subKey(topic, subtopic). */
  sub: string[];
  yearFrom: number | null;
  yearTo: number | null;
  paper: string[];
  /** Printed paper codes (7408/1, WPH11 …). */
  code: string[];
  season: string[];
  type: string[];
  difficulty: string[];
  /** Marks of a question part ("1", "2"…). */
  marks: string[];
}

export type MultiKey = "board" | "level" | "course" | "paper" | "code" | "season" | "type" | "difficulty" | "marks";

export const EMPTY_FILTERS: Filters = { board: [], level: [], course: [], q: "", topic: [], sub: [], yearFrom: null, yearTo: null, paper: [], code: [], season: [], type: [], difficulty: [], marks: [] };

export const subKey = (topic: string, subtopic: string) => `${topic}\u001f${subtopic}`;
export const splitSubKey = (key: string) => {
  const [topic, subtopic = ""] = key.split("\u001f");
  return { topic, subtopic };
};




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



/** Dropdown options with whole-question counts (from the server). */
export interface Facets {
  boards: FacetOption[];
  levels: FacetOption[];
  /** Subjects by name, with the syllabus codes under each (Physics = 8PH0, 9702 …). */
  subjects: (FacetOption & { codes?: string[] })[];
  topics: TopicNode[];
  yearBounds: { min: number; max: number } | null;
  yearCounts: Map<string, FacetOption>;
  papers: FacetOption[];
  codes: FacetOption[];
  seasons: FacetOption[];
  types: FacetOption[];
  difficulties: FacetOption[];
  marks: FacetOption[];
  /** Whole questions matching all the filters. */
  total?: number;
}


// ---------------- sorting

/** "board": grouped by board, then level (results from several boards). */
export type SortKey = "newest" | "oldest" | "topic" | "board";


// ---------------- URL <-> filters

const MULTI_KEYS: MultiKey[] = ["board", "level", "course", "paper", "code", "season", "type", "difficulty", "marks"];
const COURSE_KEY = "pa.course";

/** The subjects picked last time on this device (used when the link has none); stored one per line. */
export function rememberedCourse(): string[] {
  try {
    return (localStorage.getItem(COURSE_KEY) ?? "").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
export function rememberCourse(course: string[]) {
  try {
    if (course.length) localStorage.setItem(COURSE_KEY, course.join("\n"));
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
    board: list("board"),
    level: list("level"),
    course: list("course").length ? list("course") : list("subject").length ? list("subject") : params.toString() ? [] : rememberedCourse(),
    q: params.get("q") ?? "",
    topic: list("topic"),
    sub: list("sub"),
    yearFrom: num("yf") ?? (years.length ? Math.min(...years) : null),
    yearTo: num("yt") ?? (years.length ? Math.max(...years) : null),
    paper: list("paper"),
    code: list("code"),
    season: list("season"),
    type: list("type"),
    difficulty: list("difficulty"),
    marks: list("marks"),
  };
}

export function filtersToParams(f: Filters, sort: SortKey): URLSearchParams {
  const p = new URLSearchParams();
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
  return f.topic.length + f.sub.length + (f.yearFrom != null || f.yearTo != null ? 1 : 0) + MULTI_KEYS.reduce((n, k) => n + f[k].length, 0);
}

// ---------------- whole questions (parts grouped, like the paper)

/** "12(a)(ii)" -> "12". Parts of one paper question share this number. */
export function baseNumber(n: string): string {
  const s = String(n).trim();
  const b = s.replace(/\s*\(.*$/, "").trim();
  return b || s;
}

export function groupKeyOf(e: Pick<BankEntry, "meta" | "question">): string {
  return `${e.meta.id}|${baseNumber(e.question.number)}`;
}

/** A whole paper question: its parts (a), (b), (c)… in paper order. Looks like its first part. */
export interface QuestionGroup extends BankEntry {
  parts: BankEntry[];
  /** Parts that match the current filters / search (the whole question is still shown). */
  matched: Set<string>;
}


