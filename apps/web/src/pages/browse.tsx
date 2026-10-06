import { useQuery } from "@tanstack/react-query";
import { ArrowUp, CheckCheck, CircleCheck, Library, Loader2, SearchX, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigationType, useSearchParams } from "react-router";
import { ActiveChips, FilterRail, SearchBox } from "@/components/bank-filters";
import { warmMath } from "@/components/math-text";
import { SelectionBar } from "@/components/pdf-download";
import { QuestionCard, type SimilarItem } from "@/components/question-card";
import { SingleQuestionView } from "@/components/single-view";
import { useViewMode } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/lib/admin";
import { api } from "@/lib/api";
import { selection, useSelection } from "@/lib/selection";
import {
  activeFilterCount,
  buildFacets,
  EMPTY_FILTERS,
  filterEntries,
  filtersFromParams,
  filtersToParams,
  rememberCourse,
  sortEntries,
  useQuestionBank,
  type Filters,
  type SortKey,
} from "@/lib/question-bank";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const FIRST_PAINT = 6;
const SHOWN_KEY = "pa.shown";
const ANCHOR_KEY = "pa.anchor";
const HEADER_PX = 72;

/** The card at the top of the screen (and how far down it sits), remembered when leaving the page. */
function saveAnchor() {
  const cards = document.querySelectorAll<HTMLElement>("[data-card-key]");
  for (const el of cards) {
    const r = el.getBoundingClientRect();
    if (r.bottom > HEADER_PX + 8) {
      try {
        sessionStorage.setItem(ANCHOR_KEY, JSON.stringify({ key: el.dataset.cardKey, top: r.top }));
      } catch {
        // private mode
      }
      return;
    }
  }
}

const SORT_ITEMS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest papers first" },
  { value: "oldest", label: "Oldest papers first" },
  { value: "topic", label: "By topic" },
];

export function BrowsePage() {
  const { isAdmin } = useAdmin();
  const [params, setParams] = useSearchParams();
  // How many cards are loaded survives a trip to another page and back (so Back lands on the same card).
  const [shown, setShown] = useState(() => {
    try {
      return Math.max(PAGE_SIZE, Number(sessionStorage.getItem(SHOWN_KEY)) || 0);
    } catch {
      return PAGE_SIZE;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(SHOWN_KEY, String(shown));
    } catch {
      // private mode
    }
  }, [shown]);

  // Filters live in state (instant); the URL is updated a moment later so a click never waits for the router.
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(params));
  const [sort, setSort] = useState<SortKey>(() => (params.get("sort") as SortKey | null) ?? "newest");
  useEffect(() => {
    const t = setTimeout(() => setParams(filtersToParams(filters, sort), { replace: true, preventScrollReset: true }), 300);
    return () => clearTimeout(t);
  }, [filters, sort, setParams]);
  // The sidebar reacts instantly; the (heavier) results list catches up a frame later.
  const deferredFilters = useDeferredValue(filters);
  const deferredSort = useDeferredValue(sort);
  const updating = deferredFilters !== filters || deferredSort !== sort;
  const selected = useSelection();
  // "All" (list, the default) or "One at a time" — chosen in Settings (⚙), remembered on this device.
  // Deferred: the Settings switch moves at once; the page re-draws right after, without blocking it.
  const viewMode = useDeferredValue(useViewMode());
  const [singleIndex, setSingleIndex] = useState(0);

  const bank = useQuestionBank();
  // The bank only contains published questions (students never see drafts).
  const pool = bank.entries;
  // Admins: how many papers are waiting to be published (for the empty-state hint).
  const adminPapers = useQuery({ queryKey: ["papers"], queryFn: api.papers, enabled: isAdmin });
  const unpublishedCount = (adminPapers.data ?? []).filter((p) => p.meta.paperState !== "PUBLISHED").length;

  // A remembered / linked course that has no published questions is ignored.
  const knownCourse = !filters.course || pool.length === 0 || pool.some((e) => e.meta.subjectCode === filters.course);
  useEffect(() => {
    if (!knownCourse) setFilters((f) => ({ ...f, course: null }));
  }, [knownCourse]);
  const facets = useMemo(() => buildFacets(pool, filters), [pool, filters]);
  // Typeset every question's maths in idle time once the bank loads, so searching / filtering only reuses it.
  useEffect(() => {
    if (pool.length === 0) return;
    const texts: string[] = [];
    for (const e of sortEntries(pool, "newest")) {
      texts.push(e.question.text, ...e.question.options.map((o) => o.text));
      if (e.question.answer?.text) texts.push(e.question.answer.text);
    }
    return warmMath(texts);
  }, [pool]);
  const results = useMemo(() => sortEntries(filterEntries(pool, deferredFilters), deferredSort), [pool, deferredFilters, deferredSort]);
  // Question id -> entry, to turn each question's similarIds into cards (published questions only).
  const byId = useMemo(() => new Map(pool.map((e) => [e.question.id, e])), [pool]);
  // Resolved once per bank load, so every card gets the same array each render (cards are memoised).
  const similarById = useMemo(() => {
    const m = new Map<string, SimilarItem[]>();
    for (const e of pool)
      m.set(e.question.id, e.question.similarIds.flatMap((id) => byId.get(id) ?? []).slice(0, 5).map((s) => ({ key: s.key, meta: s.meta, question: s.question })));
    return m;
  }, [pool, byId]);
  // New results: draw what fits on screen first, the rest of the page one frame later (feels instant).
  // (The first list after the page appears is drawn in full, so Back can restore the scroll position.)
  const [renderLimit, setRenderLimit] = useState(Infinity);
  const firstList = useRef(true);

  // Back from another page (e.g. Similar questions): put the same card back at the same spot.
  // (Cards far off screen are drawn lazily with an estimated height, so a pixel scroll position isn't reliable.)
  const navType = useNavigationType();
  // Remember the top card while scrolling (once per frame at most); leaving the page then needs nothing extra.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        saveAnchor();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  const location = useLocation();
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!results.length || navType !== "POP" || restoredFor.current === location.key) return;
    let anchor: { key: string; top: number } | null = null;
    try {
      anchor = JSON.parse(sessionStorage.getItem(ANCHOR_KEY) ?? "null");
    } catch {
      anchor = null;
    }
    if (!anchor) return;
    const place = () => {
      const el = document.querySelector<HTMLElement>(`[data-card-key="${CSS.escape(anchor!.key)}"]`);
      if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - anchor!.top, behavior: "instant" });
    };
    // now, and again once the page has settled (lazy cards / images above change heights).
    // If the list re-renders meanwhile, this simply runs again; it is marked done after the last step.
    const timers = [0, 120, 300, 700].map((ms, i, all) =>
      window.setTimeout(() => {
        place();
        if (i === all.length - 1) restoredFor.current = location.key;
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [results, navType, location.key]);
  useEffect(() => {
    if (firstList.current) {
      if (results.length) firstList.current = false;
      return;
    }
    setRenderLimit(FIRST_PAINT);
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setRenderLimit(Infinity), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [results]);
  const firstResults = useRef(true);
  useEffect(() => {
    if (firstResults.current) {
      firstResults.current = false;
      return;
    }
    setSingleIndex(0);
  }, [deferredFilters, deferredSort]);
  // Switching in Settings keeps your place: the list's top card becomes "question N", and back again.
  const prevMode = useRef(viewMode);
  const lastTopIndex = useRef(0);
  useEffect(() => {
    if (viewMode !== "list") return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const top = [...document.querySelectorAll<HTMLElement>("[data-card-key]")].find((el) => el.getBoundingClientRect().bottom > 80);
        const k = top ? results.findIndex((e) => e.key === top.dataset.cardKey) : -1;
        if (k >= 0) lastTopIndex.current = k;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [viewMode, results]);
  useEffect(() => {
    if (prevMode.current === viewMode) return;
    prevMode.current = viewMode;
    if (viewMode === "single") setSingleIndex(lastTopIndex.current);
    else {
      const key = results[singleIndex]?.key;
      setShown((n) => Math.max(n, singleIndex + PAGE_SIZE));
      if (key) requestAnimationFrame(() => document.querySelector(`[data-card-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "start" }));
    }
  }, [viewMode, results, singleIndex]);
  const searching = filters.q.trim() !== "" && (updating || deferredFilters.q !== filters.q);
  const visible = results.slice(0, Math.min(shown, renderLimit));
  const pageCount = Math.min(shown, results.length);
  const paperCount = useMemo(() => new Set(results.map((r) => r.meta.id)).size, [results]);
  const totalMarks = useMemo(() => results.reduce((s, r) => s + (r.question.marks ?? 0), 0), [results]);
  const active = activeFilterCount(filters);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allResultsSelected = results.length > 0 && results.every((r) => selectedSet.has(r.question.id));

  const update = useCallback((next: Partial<Filters>, nextSort?: SortKey) => {
    setFilters((f) => ({ ...f, ...next }));
    if (nextSort) setSort(nextSort);
    setShown(PAGE_SIZE);
  }, []);
  // "Clear all" clears every side-panel filter (board, level, subject too); the search box stays.
  const clearAll = useCallback(() => {
    rememberCourse(null);
    setFilters((f) => ({ ...EMPTY_FILTERS, q: f.q }));
    setShown(PAGE_SIZE);
  }, []);
  const setCourse = useCallback(
    (course: string | null) => {
      rememberCourse(course);
      // Picking a subject also sets its board and level (so all three filters agree);
      // topics and paper numbers belong to a course, so they reset with it.
      const e = course ? pool.find((x) => x.meta.subjectCode === course) : undefined;
      update(e ? { course, board: e.meta.board, level: e.meta.curriculum, topic: [], sub: [], paper: [] } : { course: null, topic: [], sub: [], paper: [] });
    },
    [update, pool],
  );
  const setQuery = useCallback((q: string) => update({ q }), [update]);


  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* Title + description live in the navbar; kept here for screen readers */}
      <h1 className="sr-only">Practice questions</h1>

      <div className="grid items-start gap-4 lg:grid-cols-[84px_minmax(0,1fr)] lg:gap-6">
        {/* Filters: icon rail (laptop: column on the left; phone / tablet: a row of icon tabs) */}
        <div className="z-20 lg:sticky lg:top-20">
          <FilterRail filters={filters} facets={facets} update={update} active={active} onClear={clearAll} onCourse={setCourse} />
        </div>

        {/* Results */}
        <section className={cn("grid min-w-0 gap-4 pb-20 lg:pb-0", selected.length > 0 && "pb-36 lg:pb-20")}>
          {/* Search: top of the questions column, right of the filter rail */}
          <SearchBox value={filters.q} onChange={setQuery} />

          {/* Search feedback: "searching…" while typing, then a clear "found N" (or nothing found) */}
          {filters.q.trim() !== "" && !bank.isLoading && (
            <div
              key={searching ? "searching" : `done-${filters.q.trim()}-${results.length}`}
              role="status"
              className={cn(
                "fade-in flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                searching ? "text-muted-foreground" : results.length ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5",
              )}
            >
              {searching ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Searching…
                </>
              ) : (
                <>
                  <CircleCheck className={cn("search-pop size-4 shrink-0", results.length ? "text-primary" : "text-destructive")} />
                  <span className="min-w-0 truncate">
                    {results.length ? (
                      <>
                        <b className="tabular-nums">{results.length}</b> question{results.length === 1 ? "" : "s"} found for <b>“{filters.q.trim()}”</b>
                      </>
                    ) : (
                      <>
                        No questions found for <b>“{filters.q.trim()}”</b>
                      </>
                    )}
                  </span>
                  <button type="button" onClick={() => setQuery("")} className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X className="size-3.5" /> Clear
                  </button>
                </>
              )}
            </div>
          )}


          {/* Toolbar: phones show the count left and sort right on one line (no Select all) */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-muted-foreground">
              {!bank.isLoading && (
                <>
                  <span className="font-semibold text-foreground">{results.length}</span> question{results.length === 1 ? "" : "s"}
                  {results.length > 0 && (
                    <span className="hidden sm:inline">
                      {" "}
                      · {paperCount} paper{paperCount === 1 ? "" : "s"}
                      {totalMarks > 0 && <> · {totalMarks} mark{totalMarks === 1 ? "" : "s"}</>}
                    </span>
                  )}
                </>
              )}
            </p>
            {results.length > 0 && (
              <Button
                variant="ghost"
                className="h-10 gap-1.5 text-muted-foreground max-sm:hidden sm:h-9"
                aria-label={allResultsSelected ? "Unselect all" : "Select all"}
                onClick={() => (allResultsSelected ? selection.removeMany : selection.addMany)(results.map((r) => r.question.id))}
                title="Add every question in this list to the PDF"
              >
                <CheckCheck className="size-4" />
                <span className="hidden sm:inline">{allResultsSelected ? "Unselect all" : `Select all ${results.length}`}</span>
              </Button>
            )}
            <Select items={SORT_ITEMS} value={sort} onValueChange={(v) => update({}, (v as SortKey) ?? "newest")}>
              <SelectTrigger className="h-10 w-auto min-w-0 sm:h-9 sm:w-44" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {SORT_ITEMS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ActiveChips filters={filters} facets={facets} update={update} onClear={clearAll} onCourse={setCourse} />

          {bank.isLoading ? (
            <div className="grid gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          ) : bank.error ? (
            <Card className="p-6 text-destructive">{bank.error.message}</Card>
          ) : pool.length === 0 ? (
            <EmptyBank isAdmin={isAdmin} hasDrafts={unpublishedCount > 0} />
          ) : results.length === 0 ? (
            <Card className="items-center gap-3 px-6 py-14 text-center">
              <SearchX className="size-8 text-muted-foreground" />
              <p className="font-medium">{filters.q.trim() ? `No questions match “${filters.q.trim()}”` : "No questions match these filters"}</p>
              <p className="text-sm text-muted-foreground">
                {filters.q.trim() ? "Check the spelling, try fewer words, or remove a filter." : "Try removing a filter."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {filters.q.trim() && (
                  <Button variant="outline" onClick={() => setQuery("")}>
                    Clear search
                  </Button>
                )}
                {active > 0 && (
                  <Button variant="outline" onClick={clearAll}>
                    Clear filters
                  </Button>
                )}
                {filters.course && (
                  <Button variant="ghost" onClick={() => setCourse(null)}>
                    Search all courses
                  </Button>
                )}
              </div>
            </Card>
          ) : viewMode === "single" ? (
            <SingleQuestionView results={results} index={singleIndex} onIndex={setSingleIndex} similarById={similarById} />
          ) : (
            <>
              <div className={cn("grid gap-4 transition-opacity duration-200", updating && "opacity-60")}>
                {visible.map((e) => (
                  <div key={e.key} className="card-auto" data-card-key={e.key}>
                    <QuestionCard question={e.question} meta={e.meta} similar={similarById.get(e.question.id)} selectable />
                  </div>
                ))}
              </div>
              <LoadMoreSentinel enabled={pageCount < results.length && renderLimit === Infinity} onVisible={() => setShown((n) => n + PAGE_SIZE)} />
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-muted-foreground">
                  Showing {pageCount} of {results.length}
                </p>
                <div className="flex gap-2">
                  {pageCount < results.length && (
                    <Button size="lg" variant="outline" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                      Load {Math.min(PAGE_SIZE, results.length - pageCount)} more
                    </Button>
                  )}
                  {pageCount > 5 && (
                    <Button size="lg" variant="ghost" className="gap-1.5" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                      <ArrowUp className="size-4" /> Back to top
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>



      <SelectionBar ids={selected} byId={byId} />

    </div>
  );
}

// ---------------------------------------------------------------- empty state

function EmptyBank({ isAdmin, hasDrafts }: { isAdmin: boolean; hasDrafts: boolean }) {
  return (
    <Card className="items-center gap-3 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Library className="size-7" />
      </div>
      <p className="text-lg font-medium">No questions published yet</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {isAdmin
          ? hasDrafts
            ? "Papers are uploaded but not published yet. Review each paper, verify the questions and click Publish."
            : "Upload a question paper to get started."
          : "Questions will appear here once your teachers publish papers. Please check back soon."}
      </p>
      {isAdmin && (
        <Button nativeButton={false} render={<Link viewTransition to={hasDrafts ? "/admin/papers" : "/admin/upload"} />}>
          {hasDrafts ? "Review papers" : "Upload paper"}
        </Button>
      )}
    </Card>
  );
}

/** Loads the next batch automatically when the end of the list scrolls into view (button stays as a fallback). */
function LoadMoreSentinel({ enabled, onVisible }: { enabled: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onVisible);
  useEffect(() => {
    callback.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && callback.current(), { rootMargin: "600px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);
  return <div ref={ref} aria-hidden className="h-px" />;
}
