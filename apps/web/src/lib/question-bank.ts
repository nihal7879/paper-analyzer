import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api, type PaperMeta } from "@/lib/api";
import type { ReviewedQuestion } from "@/lib/review";

export interface BankEntry {
  key: string;
  meta: PaperMeta;
  question: ReviewedQuestion;
  /** Position inside its paper, for "paper order" sorting. */
  order: number;
}

/**
 * All published questions (from the database, the same for every student).
 * Filtering happens in the browser for now; with a large bank this moves to a
 * server query (GET /bank?filters) and the filter UI stays the same.
 */
export function useQuestionBank() {
  const bank = useQuery({ queryKey: ["bank"], queryFn: api.bank, staleTime: 60_000 });
  const entries = useMemo<BankEntry[]>(
    () => (bank.data ?? []).map(({ meta, question, order }) => ({ key: `${meta.id}/${question.id}`, meta, question, order })),
    [bank.data],
  );
  return { entries, isLoading: bank.isPending, error: bank.error ?? null };
}

// ---------------- filtering ----------------

export interface Filters {
  board: string | null;
  curriculum: string | null;
  subject: string | null;
  paper: string[];
  year: string[];
  season: string[];
  topic: string[];
  type: string[];
  difficulty: string[];
}

export type MultiKey = "paper" | "year" | "season" | "topic" | "type" | "difficulty";

export const EMPTY_FILTERS: Filters = { board: null, curriculum: null, subject: null, paper: [], year: [], season: [], topic: [], type: [], difficulty: [] };

const SEASON_ORDER: Record<string, number> = { j: 0, m: 1, s: 2, w: 3 };

const facetValue: Record<MultiKey, (e: BankEntry) => string> = {
  paper: (e) => String(e.meta.paperNumber ?? e.meta.paperCode),
  year: (e) => String(e.meta.year),
  season: (e) => e.meta.seasonCode,
  topic: (e) => e.question.topic,
  type: (e) => (e.question.type === "MCQ" ? "MCQ" : "WRITTEN"),
  difficulty: (e) => e.question.difficulty,
};

type SkipKey = MultiKey | "board" | "curriculum" | "subject";

function matches(e: BankEntry, f: Filters, skip?: SkipKey): boolean {
  if (skip !== "board" && f.board && e.meta.board !== f.board) return false;
  if (skip !== "curriculum" && f.curriculum && e.meta.curriculum !== f.curriculum) return false;
  if (skip !== "subject" && f.subject && e.meta.subjectCode !== f.subject) return false;
  for (const k of Object.keys(facetValue) as MultiKey[]) {
    if (k === skip || f[k].length === 0) continue;
    if (!f[k].includes(facetValue[k](e))) return false;
  }
  return true;
}

export function filterEntries(entries: BankEntry[], f: Filters): BankEntry[] {
  return entries.filter((e) => matches(e, f));
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/** Options for each filter, counted against all OTHER active filters (so counts show what you'd get). */
export function buildFacets(entries: BankEntry[], f: Filters) {
  const count = (skip: SkipKey, value: (e: BankEntry) => string, label: (e: BankEntry) => string) => {
    const map = new Map<string, FacetOption>();
    for (const e of entries) {
      if (!matches(e, f, skip)) continue;
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

  // Only boards / levels that have published questions are listed.
  const boardMap = count("board", (e) => e.meta.board, (e) => e.meta.board);
  const curriculumMap = count("curriculum", (e) => e.meta.curriculum, (e) => e.meta.curriculum);
  const boards = [...boardMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const curriculums = [...curriculumMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const subjects = [...count("subject", (e) => e.meta.subjectCode, (e) => `${e.meta.subjectName} (${e.meta.subjectCode})`).values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const papers = withSelected(
    count("paper", facetValue.paper, (e) => `Paper ${e.meta.paperNumber ?? e.meta.paperCode}${e.meta.componentName ? ` · ${e.meta.componentName}` : ""}`),
    f.paper,
    (v) => `Paper ${v}`,
  ).sort((a, b) => Number(a.value) - Number(b.value));
  const years = withSelected(count("year", facetValue.year, (e) => String(e.meta.year)), f.year, (v) => v).sort((a, b) => Number(b.value) - Number(a.value));
  const seasons = withSelected(count("season", facetValue.season, (e) => e.meta.seasonName), f.season, (v) => v).sort(
    (a, b) => (SEASON_ORDER[a.value] ?? 9) - (SEASON_ORDER[b.value] ?? 9),
  );
  const topics = withSelected(
    count("topic", facetValue.topic, (e) => (e.question.topicCode ? `${e.question.topicCode}. ${e.question.topic}` : e.question.topic)),
    f.topic,
    (v) => v,
  ).sort((a, b) => topicSortKey(a.label) - topicSortKey(b.label) || a.label.localeCompare(b.label));
  const types = withSelected(count("type", facetValue.type, (e) => (e.question.type === "MCQ" ? "MCQ" : "Theory")), f.type, (v) => v);
  const difficulties = withSelected(count("difficulty", facetValue.difficulty, (e) => e.question.difficulty), f.difficulty, (v) => v);

  return { boards, curriculums, subjects, papers, years, seasons, topics, types, difficulties };
}

function topicSortKey(label: string): number {
  const n = parseFloat(label);
  return Number.isFinite(n) ? n : 999;
}

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
        topicSortKey(a.question.topicCode ?? "") - topicSortKey(b.question.topicCode ?? "") || a.question.topic.localeCompare(b.question.topic) || byPaper(a, b),
    );
  return sorted;
}

// ---------------- URL <-> filters ----------------

const MULTI_KEYS: MultiKey[] = ["paper", "year", "season", "topic", "type", "difficulty"];

export function filtersFromParams(params: URLSearchParams): Filters {
  const list = (k: string) => params.getAll(k).filter(Boolean);
  return {
    board: params.get("board"),
    curriculum: params.get("curriculum"),
    subject: params.get("subject"),
    paper: list("paper"),
    year: list("year"),
    season: list("season"),
    topic: list("topic"),
    type: list("type"),
    difficulty: list("difficulty"),
  };
}

export function filtersToParams(f: Filters, sort: SortKey): URLSearchParams {
  const p = new URLSearchParams();
  if (f.board) p.set("board", f.board);
  if (f.curriculum) p.set("curriculum", f.curriculum);
  if (f.subject) p.set("subject", f.subject);
  for (const k of MULTI_KEYS) for (const v of f[k]) p.append(k, v);
  if (sort !== "newest") p.set("sort", sort);
  return p;
}

export function activeFilterCount(f: Filters): number {
  return MULTI_KEYS.reduce((n, k) => n + f[k].length, 0);
}
