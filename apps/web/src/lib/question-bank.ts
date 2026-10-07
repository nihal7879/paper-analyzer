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
  /** Marks of a question part ("1", "2"…). */
  marks: string[];
}

export type MultiKey = "paper" | "season" | "type" | "difficulty" | "marks";

export const EMPTY_FILTERS: Filters = { board: null, level: null, course: null, q: "", topic: [], sub: [], yearFrom: null, yearTo: null, paper: [], season: [], type: [], difficulty: [], marks: [] };

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
  /** Subjects also carry their board and level (picking a subject sets both). */
  subjects: (FacetOption & { board?: string; level?: string })[];
  topics: TopicNode[];
  yearBounds: { min: number; max: number } | null;
  yearCounts: Map<string, FacetOption>;
  papers: FacetOption[];
  seasons: FacetOption[];
  types: FacetOption[];
  difficulties: FacetOption[];
  marks: FacetOption[];
  /** Whole questions matching all the filters. */
  total?: number;
}


// ---------------- sorting

export type SortKey = "newest" | "oldest" | "topic";


// ---------------- URL <-> filters

const MULTI_KEYS: MultiKey[] = ["paper", "season", "type", "difficulty", "marks"];
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
    marks: list("marks"),
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


