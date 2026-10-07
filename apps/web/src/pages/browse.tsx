import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, ArrowUp, CheckCheck, CircleCheck, Library, Loader2, SearchX, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigationType, useSearchParams } from "react-router";
import { ActiveChips } from "@/components/bank-filters";
import { FilterPanel, FiltersButton, SearchToggle } from "@/components/filter-bar";
import { SettingsMenu } from "@/components/settings-menu";
import { Logo, ThemeToggle } from "@/components/top-bar";
import { warmMath } from "@/components/math-text";
import { SelectionBar } from "@/components/pdf-download";
import { QuestionCard } from "@/components/question-card";
import { SingleQuestionView } from "@/components/single-view";
import { useViewMode } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/lib/admin";
import { api } from "@/lib/api";
import { selection, useSelection } from "@/lib/selection";
import { fetchIds, PAGE_SIZE, useBankFacets, useBankPages, useEntries } from "@/lib/bank-api";
import { activeFilterCount, EMPTY_FILTERS, filtersFromParams, filtersToParams, rememberCourse, type Filters, type SortKey } from "@/lib/question-bank";
import { cn } from "@/lib/utils";

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

  // Filters live in state (instant); the URL is updated a moment later so a click never waits for the router.
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(params));
  const [sort, setSort] = useState<SortKey>(() => (params.get("sort") as SortKey | null) ?? "newest");
  useEffect(() => {
    const t = setTimeout(() => setParams(filtersToParams(filters, sort), { replace: true, preventScrollReset: true }), 300);
    return () => clearTimeout(t);
  }, [filters, sort, setParams]);
  // Typing in search waits a moment before asking the server (fewer requests while typing)
  const [typedQ, setTypedQ] = useState(filters.q);
  useEffect(() => {
    if (typedQ === filters.q) return;
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: typedQ })), 250);
    return () => clearTimeout(t);
  }, [typedQ, filters.q]);
  const selected = useSelection();
  // "All" (list, the default) or "One at a time" — chosen in Settings (⚙), remembered on this device.
  // Deferred: the Settings switch moves at once; the page re-draws right after, without blocking it.
  const viewMode = useDeferredValue(useViewMode());
  const [singleIndex, setSingleIndex] = useState(0);

  // The server filters, counts, sorts and searches; the browser gets 20 whole questions at a time.
  const list = useBankPages(filters, sort);
  const groups = list.groups;
  const total = list.total;
  const { facets, isFetching: facetsFetching } = useBankFacets(filters);
  // Admins: how many papers are waiting to be published (for the empty-state hint).
  const adminPapers = useQuery({ queryKey: ["papers"], queryFn: api.papers, enabled: isAdmin });
  const unpublishedCount = (adminPapers.data ?? []).filter((p) => p.meta.paperState !== "PUBLISHED").length;

  // A remembered / linked course that has no published questions is ignored.
  const knownCourse = !filters.course || facetsFetching || facets.subjects.length === 0 || facets.subjects.some((o) => o.value === filters.course);
  useEffect(() => {
    if (!knownCourse) setFilters((f) => ({ ...f, course: null }));
  }, [knownCourse]);
  // Typeset the loaded questions' maths in idle time, so scrolling and re-filtering reuse it.
  useEffect(() => {
    const texts: string[] = [];
    for (const g of groups)
      for (const p of g.parts) {
        texts.push(p.question.text, ...p.question.options.map((o) => o.text));
        if (p.question.answer?.text) texts.push(p.question.answer.text);
      }
    if (texts.length) return warmMath(texts);
  }, [groups]);
  // Every part id of the matching questions (Select all) — a light list of ids from the server.
  const idsQuery = useQuery({ queryKey: ["bank-ids", filtersToParams(filters, "newest").toString()], queryFn: () => fetchIds(filters), enabled: total > 0, staleTime: 60_000 });
  const selectedEntries = useEntries(selected);

  // Back from another page (e.g. Similar questions): put the same card back at the same spot.
  // (The pages already loaded stay in memory for a while, so the same cards are there.)
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
    if (!groups.length || navType !== "POP" || restoredFor.current === location.key) return;
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
    // now, and again once the page has settled (lazy cards / images above change heights)
    const timers = [0, 120, 300, 700].map((ms, i, all) =>
      window.setTimeout(() => {
        place();
        if (i === all.length - 1) restoredFor.current = location.key;
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [groups, navType, location.key]);
  const firstResults = useRef(true);
  useEffect(() => {
    if (firstResults.current) {
      firstResults.current = false;
      return;
    }
    setSingleIndex(0);
  }, [filters, sort]);
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
        const k = top ? groups.findIndex((e) => e.key === top.dataset.cardKey) : -1;
        if (k >= 0) lastTopIndex.current = k;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [viewMode, groups]);
  useEffect(() => {
    if (prevMode.current === viewMode) return;
    prevMode.current = viewMode;
    if (viewMode === "single") setSingleIndex(lastTopIndex.current);
    else {
      const key = groups[singleIndex]?.key;
      if (key) requestAnimationFrame(() => document.querySelector(`[data-card-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "start" }));
    }
  }, [viewMode, groups, singleIndex]);
  const searching = typedQ.trim() !== "" && (typedQ !== filters.q || list.isUpdating);
  const active = activeFilterCount(filters);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const resultIds = idsQuery.data?.ids ?? [];
  const allResultsSelected = resultIds.length > 0 && resultIds.every((id) => selectedSet.has(id));
  const selectAll = async () => {
    const ids = idsQuery.data?.ids ?? (await fetchIds(filters)).ids;
    (allResultsSelected ? selection.removeMany : selection.addMany)(ids);
  };

  const update = useCallback((next: Partial<Filters>, nextSort?: SortKey) => {
    setFilters((f) => ({ ...f, ...next }));
    if (next.q !== undefined) setTypedQ(next.q);
    if (nextSort) setSort(nextSort);
  }, []);
  // "Clear all" clears every side-panel filter (board, level, subject too); the search box stays.
  const clearAll = useCallback(() => {
    rememberCourse(null);
    setFilters((f) => ({ ...EMPTY_FILTERS, q: f.q }));
  }, []);
  const setCourse = useCallback(
    (course: string | null) => {
      rememberCourse(course);
      // Picking a subject also sets its board and level (so all three filters agree);
      // topics and paper numbers belong to a course, so they reset with it.
      const o = course ? facets.subjects.find((x) => x.value === course) : undefined;
      update(o ? { course, board: o.board ?? null, level: o.level ?? null, topic: [], sub: [], paper: [] } : { course: null, topic: [], sub: [], paper: [] });
    },
    [update, facets.subjects],
  );
  const setQuery = useCallback((q: string) => setTypedQ(q), []);
  const clearQuery = useCallback(() => update({ q: "" }), [update]);
  // Search is an icon until clicked; filters open in a panel from the "Filters" button.
  const [searchOpen, setSearchOpen] = useState(() => filters.q !== "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // phones: while the logo shows the app name, the count steps aside to make room
  const [logoName, setLogoName] = useState(false);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  // "Done" in the filter panel: its choices replace the current ones (the search text stays).
  const applyFilters = useCallback(
    (next: Omit<Filters, "q">) => {
      rememberCourse(next.course);
      update(next);
    },
    [update],
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* Title + description live in the navbar; kept here for screen readers */}
      <h1 className="sr-only">Practice questions</h1>

      <div className="grid gap-4">
        {/* Results (full width; filters open from the toolbar) */}
        <section className={cn("grid min-w-0 gap-4", selected.length > 0 && "pb-20")}>
          {/* Toolbar: count · 🔍 · Filters · Select all · Sort */}
          <div className="flex items-center gap-2">
            {!isAdmin && (
              <div className={cn("mr-1 sm:mr-2", logoName && "max-sm:mr-auto", (searchOpen || typedQ) && "max-sm:hidden")}>
                <Logo compact onNameShown={setLogoName} />
              </div>
            )}
            <p className={cn("mr-auto shrink-0 text-sm text-muted-foreground", (searchOpen || typedQ || logoName) && "max-sm:hidden")}>
              {!list.isLoading && (
                <>
                  <span className="font-semibold text-foreground">{total}</span> question{total === 1 ? "" : "s"}
                  {total > 0 && (
                    <span className="hidden sm:inline">
                      {" "}
                      · {list.papers} paper{list.papers === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              )}
            </p>
            <SearchToggle value={typedQ} onChange={setQuery} open={searchOpen} onOpenChange={setSearchOpen} />
            <FiltersButton open={filtersOpen} active={active} onClick={() => setFiltersOpen((o) => !o)} />
            {total > 0 && (
              <Button
                variant="outline"
                className="h-10 shrink-0 gap-1.5 max-md:hidden sm:h-9"
                aria-label={allResultsSelected ? "Unselect all" : "Select all"}
                onClick={() => void selectAll()}
                title="Add every question in this list to the PDF"
              >
                <CheckCheck className="size-4" />
                {allResultsSelected ? "Unselect all" : `Select all ${total}`}
              </Button>
            )}
            <Select items={SORT_ITEMS} value={sort} onValueChange={(v) => update({}, (v as SortKey) ?? "newest")}>
              <SelectTrigger className="btn-soft h-10 w-auto shrink-0 rounded-xl border-[color:var(--btn-border)] bg-card font-semibold sm:h-9 sm:w-44" aria-label="Sort">
                <ArrowDownUp className="size-4 sm:hidden" />
                <span className="max-sm:hidden">
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent align="end">
                {SORT_ITEMS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isAdmin && (
              <>
                <SettingsMenu />
                {/* phones: light / dark lives in Settings */}
                <ThemeToggle className="max-sm:hidden" />
              </>
            )}
          </div>

          <FilterPanel open={filtersOpen} onClose={closeFilters} filters={filters} onApply={applyFilters} />

          {/* Search feedback: "searching…" while typing, then a clear "found N" (or nothing found) */}
          {typedQ.trim() !== "" && !list.isLoading && (
            <div
              key={searching ? "searching" : `done-${filters.q.trim()}-${total}`}
              role="status"
              className={cn(
                "fade-in flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                searching ? "text-muted-foreground" : total ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5",
              )}
            >
              {searching ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Searching…
                </>
              ) : (
                <>
                  <CircleCheck className={cn("search-pop size-4 shrink-0", total ? "text-primary" : "text-destructive")} />
                  <span className="min-w-0 truncate">
                    {total ? (
                      <>
                        <b className="tabular-nums">{total}</b> question{total === 1 ? "" : "s"} found for <b>“{filters.q.trim()}”</b>
                      </>
                    ) : (
                      <>
                        No questions found for <b>“{filters.q.trim()}”</b>
                      </>
                    )}
                  </span>
                  <button type="button" onClick={clearQuery} className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X className="size-3.5" /> Clear
                  </button>
                </>
              )}
            </div>
          )}


          <ActiveChips filters={filters} facets={facets} update={update} onClear={clearAll} onCourse={setCourse} />

          {list.isLoading ? (
            <div className="grid gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          ) : list.error ? (
            <Card className="p-6 text-destructive">{list.error.message}</Card>
          ) : list.bankEmpty ? (
            <EmptyBank isAdmin={isAdmin} hasDrafts={unpublishedCount > 0} />
          ) : total === 0 ? (
            <Card className="items-center gap-3 px-6 py-14 text-center">
              <SearchX className="size-8 text-muted-foreground" />
              <p className="font-medium">{filters.q.trim() ? `No questions match “${filters.q.trim()}”` : "No questions match these filters"}</p>
              <p className="text-sm text-muted-foreground">
                {filters.q.trim() ? "Check the spelling, try fewer words, or remove a filter." : "Try removing a filter."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {filters.q.trim() && (
                  <Button variant="outline" onClick={clearQuery}>
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
            <SingleQuestionView results={groups} total={total} onNeedMore={list.loadMore} index={singleIndex} onIndex={setSingleIndex} />
          ) : (
            <>
              <div className={cn("grid gap-4 transition-opacity duration-200", list.isUpdating && "opacity-60")}>
                {groups.map((e, n) => (
                  <div key={e.key} className="card-auto" data-card-key={e.key}>
                    <QuestionCard
                      question={e.question}
                      meta={e.meta}
                      parts={e.partQuestions}
                      matched={e.matched}
                      similar={e.similar}
                      selectable
                      serial={n + 1}
                    />
                  </div>
                ))}
              </div>
              <LoadMoreSentinel enabled={list.hasMore && !list.isLoadingMore} onVisible={list.loadMore} />
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-muted-foreground">
                  Showing {groups.length} of {total}
                </p>
                <div className="flex gap-2">
                  {list.hasMore && (
                    <Button size="lg" variant="outline" onClick={list.loadMore} disabled={list.isLoadingMore} className="gap-1.5">
                      {list.isLoadingMore && <Loader2 className="size-4 animate-spin" />}
                      Load {Math.min(PAGE_SIZE, total - groups.length)} more
                    </Button>
                  )}
                  {groups.length > 5 && (
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



      <SelectionBar ids={selected} byId={selectedEntries.byId} />

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
