import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { CardQuestion, SimilarItem } from "@/components/question-card";
import { api, type BankItem } from "@/lib/api";
import { filtersToParams, type BankEntry, type FacetOption, type Facets, type Filters, type QuestionGroup, type SortKey, type TopicNode } from "@/lib/question-bank";

/**
 * The student question bank, served page by page: filtering, dropdown counts, sorting and search run on the
 * server (MySQL), so the browser never downloads the whole bank — ready for a very large number of questions.
 */

export const PAGE_SIZE = 20;

interface PageItem {
  key: string;
  parts: BankItem[];
  matched: string[];
  similar: BankItem[];
}
interface BankPage {
  total: number;
  papers: number;
  offset: number;
  limit: number;
  bankEmpty: boolean;
  items: PageItem[];
}
interface FacetsResponse extends Omit<Facets, "yearCounts"> {
  yearCounts: Record<string, FacetOption>;
  fixed?: Filters;
}

/** A whole question for the list: looks like its first part, plus its parts, matching parts and similar ones. */
export interface ListGroup extends QuestionGroup {
  partQuestions: CardQuestion[];
  similar: SimilarItem[];
}

export const toEntry = ({ meta, question, order }: BankItem): BankEntry => ({ key: `${meta.id}/${question.id}`, meta, question, order, search: "" });

function toGroup(item: PageItem): ListGroup {
  const parts = item.parts.map(toEntry);
  return {
    ...parts[0],
    key: item.key,
    parts,
    partQuestions: parts.map((p) => p.question),
    matched: new Set(item.matched),
    similar: item.similar.map((s) => ({ key: `${s.meta.id}/${s.question.id}`, meta: s.meta, question: s.question })),
  };
}

const paramsOf = (f: Filters, sort: SortKey = "newest", extra: Record<string, string> = {}) => {
  const p = filtersToParams(f, sort);
  // the URL keeps "subject" remembered in the browser only; the server always needs the course
  if (f.course) p.set("course", f.course);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p;
};

/** Pages of whole questions (20 at a time, more as the student scrolls). */
export function useBankPages(filters: Filters, sort: SortKey) {
  const query = useInfiniteQuery({
    queryKey: ["bank-search", paramsOf(filters, sort).toString()],
    queryFn: ({ pageParam }) => api.bankGet<BankPage>("search", paramsOf(filters, sort, { offset: String(pageParam), limit: String(PAGE_SIZE) })),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const groups = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items.map(toGroup)), [query.data]);
  const first = query.data?.pages[0];
  return {
    groups,
    total: first?.total ?? 0,
    papers: first?.papers ?? 0,
    bankEmpty: first?.bankEmpty ?? false,
    isLoading: query.isPending,
    /** Showing the previous list while the new filters / search load. */
    isUpdating: query.isPlaceholderData || (query.isFetching && !query.isFetchingNextPage),
    error: query.error,
    hasMore: !!query.hasNextPage,
    loadMore: () => !query.isFetchingNextPage && void query.fetchNextPage(),
    isLoadingMore: query.isFetchingNextPage,
  };
}

const toFacets = (r: FacetsResponse): Facets & { fixed?: Filters } => ({ ...r, yearCounts: new Map(Object.entries(r.yearCounts)) });

export const fetchFacets = (filters: Filters, fix = false) => api.bankGet<FacetsResponse>("facets", paramsOf(filters, "newest", fix ? { fix: "1" } : {})).then(toFacets);

export const EMPTY_FACETS: Facets = {
  boards: [],
  levels: [],
  subjects: [],
  topics: [] as TopicNode[],
  yearBounds: null,
  yearCounts: new Map(),
  papers: [],
  seasons: [],
  types: [],
  difficulties: [],
  marks: [],
  total: 0,
};

/** Dropdown options with whole-question counts for these filters. */
export function useBankFacets(filters: Filters, enabled = true) {
  const query = useQuery({
    queryKey: ["bank-facets", paramsOf(filters).toString()],
    queryFn: () => fetchFacets(filters),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  });
  return { facets: query.data ?? EMPTY_FACETS, isLoading: query.isPending, isFetching: query.isFetching };
}

/** Every part id of the matching questions (for Select all); only asked for when needed. */
/** Every part id of the matching questions, in the list's order (Select all). */
export const fetchIds = (filters: Filters, sort: SortKey = "newest") => api.bankGet<{ ids: string[]; capped: boolean }>("ids", paramsOf(filters, sort));

/** Published questions by id, in the order given (PDF selection, Similar page, print). */
export function useEntries(ids: string[]) {
  const key = ids.join(",");
  const query = useQuery({
    queryKey: ["bank-entries", key],
    queryFn: () => api.bankEntries(ids),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const entries = useMemo(() => (ids.length ? (query.data ?? []).map(toEntry) : []), [query.data, ids.length]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.question.id, e])), [entries]);
  return { entries, byId, isLoading: ids.length > 0 && query.isPending };
}

/** Every published part of one paper (print a whole paper). */
export function usePaperEntries(paper: string | null) {
  const query = useQuery({ queryKey: ["bank-paper", paper], queryFn: () => api.bankPaper(paper!), enabled: !!paper, staleTime: 60_000 });
  return { entries: useMemo(() => (query.data ?? []).map(toEntry), [query.data]), isLoading: !!paper && query.isPending };
}
