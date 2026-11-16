import { useQuery } from "@tanstack/react-query";
import { ArrowUp, CheckCheck, CircleCheck, Library, Loader2, SearchX, X } from "lucide-react";
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigationType, useSearchParams } from "react-router";
import { ActiveChips } from "@/components/bank-filters";
import { FilterPanel, FiltersButton, SearchToggle } from "@/components/filter-bar";
import { AdminMenu } from "@/components/admin-menu";
import { SettingsMenu } from "@/components/settings-menu";
import { SortMenu } from "@/components/sort-menu";
import { Logo, ThemeToggle } from "@/components/top-bar";
import { warmMath } from "@/components/math-text";
import { SelectionBar } from "@/components/pdf-download";
import { QuestionCard } from "@/components/question-card";
import { SingleQuestionView } from "@/components/single-view";
import { useViewMode } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/lib/admin";
import { api, setBoardInSource, type Question } from "@/lib/api";
import { difficultyLabel, difficultyStyle } from "@/lib/format";
import { selection, useSelection } from "@/lib/selection";
import { fetchIds, PAGE_SIZE, useBankFacets, useBankPages, useEntries } from "@/lib/bank-api";
import { activeFilterCount, EMPTY_FILTERS, filtersFromParams, filtersToParams, formatSort, parseSort, rememberCourse, SORT_GROUPS, type Filters, type SortGroup, type SortKey } from "@/lib/question-bank";
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

const DIFF_RANK: Record<string, number> = { EASY: 1, MEDIUM: 2, HARD: 3 };
type GroupPart = { id: string; difficulty: string; marks: number | null; type: string };
/** The parts a whole question counts as for sorting / headings: those matching the filters (as on the card), else all. */
function shownParts(e: { partQuestions: GroupPart[]; matched: Set<string> }) {
  const hit = e.partQuestions.filter((p) => e.matched.has(p.id));
  return hit.length ? hit : e.partQuestions;
}
/** The heading of a question's group under the first ticked sort (same rules as the server's order). */
function groupHeading(e: ListGroupLike, by: SortGroup): { key: string; badge: string; badgeClass: string; text?: string } | null {
  const parts = shownParts(e);
  if (by === "board") return { key: `${e.meta.board}|${e.meta.curriculum}`, badge: e.meta.board, badgeClass: "bg-primary/10 text-primary", text: e.meta.curriculum };
  if (by === "difficulty") {
    const d = parts.reduce((h, p) => ((DIFF_RANK[p.difficulty] ?? 2) > (DIFF_RANK[h] ?? 2) ? p.difficulty : h), parts[0]?.difficulty ?? "MEDIUM") as Question["difficulty"];
    return { key: d, badge: difficultyLabel(d), badgeClass: difficultyStyle[d] };
  }
  if (by === "marks") {
    const known = parts.filter((p) => p.marks != null);
    const m = known.reduce((n, p) => n + (p.marks ?? 0), 0);
    return known.length ? { key: String(m), badge: `${m} mark${m === 1 ? "" : "s"}`, badgeClass: "bg-primary/10 text-primary" } : { key: "-", badge: "Marks not set", badgeClass: "bg-muted text-muted-foreground" };
  }
  if (by === "type") {
    const mcq = parts.some((p) => p.type === "MCQ");
    return { key: mcq ? "MCQ" : "W", badge: mcq ? "MCQ" : "Written", badgeClass: "bg-primary/10 text-primary" };
  }
  return null; // topic: no headings (each card names its topic)
}
type ListGroupLike = { partQuestions: GroupPart[]; matched: Set<string>; meta: { board: string; curriculum: string } };

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

  // Several boards in the results: each question's source line names its board (the list re-renders when this flips).
  const mixedBoards = facets.boards.filter((b) => b.count > 0).length > 1;
  // Sorts that can't change the order are hidden: "By topic" with one subtopic, the others with one value ticked
  const oneSubtopic =
    (filters.sub.length === 1 && filters.topic.length <= 1) ||
    (filters.topic.length === 1 && filters.sub.length === 0 && (facets.topics.find((t) => t.topic === filters.topic[0])?.subs.length ?? 2) <= 1);
  const sortGroups = useMemo(
    () =>
      SORT_GROUPS.filter(
        (g) =>
          !(g === "topic" && oneSubtopic) &&
          !(g === "difficulty" && filters.difficulty.length === 1) &&
          !(g === "marks" && filters.marks.length === 1) &&
          !(g === "type" && filters.type.length === 1),
      ),
    [oneSubtopic, filters.difficulty.length, filters.marks.length, filters.type.length],
  );
  const parsedSort = parseSort(sort);
  const firstGroup = parsedSort.groups[0];
  // a ticked sort was hidden: drop it (the rest stay)
  useEffect(() => {
    const { groups: g, order } = parseSort(sort);
    const kept = g.filter((x) => sortGroups.includes(x));
    if (kept.length !== g.length) setSort(formatSort(kept, order));
  }, [sortGroups, sort]);
  setBoardInSource(mixedBoards);

  // A remembered / linked course that has no published questions is ignored.
  const isKnown = (c: string) => facets.subjects.some((o) => o.value === c || o.codes?.includes(c));
  const knownCourse = !filters.course.length || facetsFetching || facets.subjects.length === 0 || filters.course.every(isKnown);
  useEffect(() => {
    if (!knownCourse) setFilters((f) => ({ ...f, course: f.course.filter(isKnown) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const idsQuery = useQuery({ queryKey: ["bank-ids", filtersToParams(filters, sort).toString()], queryFn: () => fetchIds(filters, sort), enabled: total > 0, staleTime: 60_000 });
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
  // Questions added by "Select all" belong to the filter they were picked under, so they are dropped when it changes
  // (any change to the side-panel filters clears the whole pick: see panelKey below).
  const bulkPicked = useRef<string[]>([]);
  const selectAll = async () => {
    const ids = idsQuery.data?.ids ?? (await fetchIds(filters, sort)).ids;
    if (allResultsSelected) {
      selection.removeMany(ids);
      bulkPicked.current = [];
    } else {
      bulkPicked.current = [...bulkPicked.current, ...ids.filter((id) => !selectedSet.has(id))];
      selection.addMany(ids);
    }
  };
  const filterKey = filtersToParams(filters, "newest").toString();
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    if (bulkPicked.current.length) selection.removeMany(bulkPicked.current);
    bulkPicked.current = [];
  }, [filterKey]);

  // Changing a filter (board, level, subject, topic, year …) starts a new pick: whatever was selected for the PDF under
  // the old filter is removed, so it doesn't show up under the new one. (Typing in the search box keeps the pick.)
  const panelKey = filtersToParams({ ...filters, q: "" }, "newest").toString();
  const lastPanelKey = useRef(panelKey);
  useEffect(() => {
    if (lastPanelKey.current === panelKey) return;
    lastPanelKey.current = panelKey;
    selection.clear();
    bulkPicked.current = [];
  }, [panelKey]);

  const update = useCallback((next: Partial<Filters>, nextSort?: SortKey) => {
    setFilters((f) => ({ ...f, ...next }));
    if (next.q !== undefined) setTypedQ(next.q);
    if (nextSort) setSort(nextSort);
  }, []);
  // "Clear all" clears every side-panel filter (board, level, subject too); the search box stays.
  const clearAll = useCallback(() => {
    rememberCourse([]);
    setFilters((f) => ({ ...EMPTY_FILTERS, q: f.q }));
  }, []);
  const setCourse = useCallback(
    (course: string[]) => {
      rememberCourse(course);
      // A subject spans every board (Physics = 8PH0, 9702 …): board and level stay as chosen.
      // Topics and paper numbers belong to a syllabus, so they reset with it.
      update({ course, topic: [], sub: [], paper: [], code: [] });
    },
    [update],
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
    (next: Omit<Filters, "q">, nextSort?: SortKey) => {
      rememberCourse(next.course);
      update(next, nextSort);
    },
    [update],
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* Title + description live in the navbar; kept here for screen readers */}
      <h1 className="sr-only">Practice questions</h1>

      <div className="grid gap-4">
        {/* Results (full width; filters open from the toolbar) */}
        <section className={cn("grid min-w-0 gap-4", selected.length > 0 && "pb-28")}>
          {/* Toolbar: count · 🔍 · Filters · Select all · Sort */}
          <div className="flex items-center gap-2">
            <div className={cn("mr-1 sm:mr-2", logoName && "max-sm:mr-auto", (searchOpen || typedQ) && "max-sm:hidden")}>
              <Logo compact onNameShown={setLogoName} />
            </div>
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
            <SortMenu sort={sort} available={sortGroups} onChange={(v) => update({}, v)} />
            <SettingsMenu />
            {/* admins: light / dark is in the Admin menu; students' phones: in Settings */}
            {isAdmin ? <AdminMenu /> : <ThemeToggle className="max-sm:hidden" />}
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
                {filters.course.length > 0 && (
                  <Button variant="ghost" onClick={() => setCourse([])}>
                    Search all courses
                  </Button>
                )}
              </div>
            </Card>
          ) : viewMode === "single" ? (
            <SingleQuestionView key={mixedBoards ? "mixed" : "one"} results={groups} total={total} onNeedMore={list.loadMore} index={singleIndex} onIndex={setSingleIndex} />
          ) : (
            <>
              <div key={mixedBoards ? "mixed" : "one"} className={cn("grid gap-4 transition-opacity duration-200", list.isUpdating && "opacity-60")}>
                {groups.map((e, n) => {
                  // a heading where the next group of the first ticked sort starts (Easy / Medium / Hard, 2 marks, MCQ, a board …)
                  const head = firstGroup ? groupHeading(e, firstGroup) : null;
                  const showHead = !!head && (n === 0 || groupHeading(groups[n - 1], firstGroup!)?.key !== head.key);
                  return (
                    <Fragment key={e.key}>
                      {showHead && head && (
                        <h2 className={cn("flex items-center gap-2 text-sm font-semibold text-primary", n > 0 && "pt-3")}>
                          <span className={cn("rounded-full px-2.5 py-1", head.badgeClass)}>{head.badge}</span>
                          {head.text && <span>{head.text}</span>}
                        </h2>
                      )}
                      <div className="card-auto" data-card-key={e.key}>
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
                    </Fragment>
                  );
                })}
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
