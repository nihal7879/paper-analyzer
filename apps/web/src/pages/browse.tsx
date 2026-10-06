import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Check, CheckCheck, ChevronDown, Library, ListFilter, PanelLeftClose, PanelLeftOpen, Search, SearchX, X } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Collapse } from "@/components/collapse";
import { SelectionBar } from "@/components/pdf-download";
import { QuestionCard, type SimilarItem } from "@/components/question-card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/lib/admin";
import { api } from "@/lib/api";
import { difficultyLabel, difficultyStyle } from "@/lib/format";
import { selection, useSelection } from "@/lib/selection";
import {
  activeFilterCount,
  buildFacets,
  EMPTY_FILTERS,
  filterEntries,
  filtersFromParams,
  filtersToParams,
  sortEntries,
  useQuestionBank,
  type FacetOption,
  type Filters,
  type MultiKey,
  type SortKey,
} from "@/lib/question-bank";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const SIDEBAR_KEY = "pa.sidebarOpen";

const SORT_ITEMS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest papers first" },
  { value: "oldest", label: "Oldest papers first" },
  { value: "topic", label: "By topic" },
];

type Facets = ReturnType<typeof buildFacets>;

function readSidebarPref(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "0";
  } catch {
    return true;
  }
}

export function BrowsePage() {
  const { isAdmin } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState(PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarPref);

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

  const bank = useQuestionBank();
  // The bank only contains published questions (students never see drafts).
  const pool = bank.entries;
  // Admins: how many papers are waiting to be published (for the empty-state hint).
  const adminPapers = useQuery({ queryKey: ["papers"], queryFn: api.papers, enabled: isAdmin });
  const unpublishedCount = (adminPapers.data ?? []).filter((p) => p.meta.paperState !== "PUBLISHED").length;

  const facets = useMemo(() => buildFacets(pool, filters), [pool, filters]);
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
  const [openSimilar, setOpenSimilar] = useState<SimilarItem | null>(null);
  const visible = results.slice(0, shown);
  const paperCount = useMemo(() => new Set(results.map((r) => r.meta.id)).size, [results]);
  const totalMarks = useMemo(() => results.reduce((s, r) => s + (r.question.marks ?? 0), 0), [results]);
  const active = activeFilterCount(filters) + (filters.board ? 1 : 0) + (filters.curriculum ? 1 : 0) + (filters.subject ? 1 : 0);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allResultsSelected = results.length > 0 && results.every((r) => selectedSet.has(r.question.id));

  const update = useCallback((next: Partial<Filters>, nextSort?: SortKey) => {
    setFilters((f) => ({ ...f, ...next }));
    if (nextSort) setSort(nextSort);
    setShown(PAGE_SIZE);
  }, []);
  const clearAll = useCallback(() => update({ ...EMPTY_FILTERS }), [update]);

  function toggleSidebar() {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  const panelProps = { filters, facets, update, active, onClear: clearAll };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* Title + description live in the navbar; kept here for screen readers */}
      <h1 className="sr-only">Practice questions</h1>

      <div className={cn("grid items-start gap-6", sidebarOpen && "lg:grid-cols-[272px_minmax(0,1fr)]")}>
        {/* Sidebar (desktop) */}
        {sidebarOpen && (
          <aside className="enter-up sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border bg-card lg:block" aria-label="Filters">
            <FilterPanel {...panelProps} />
          </aside>
        )}

        {/* Results */}
        <section className={cn("grid min-w-0 gap-4", selected.length > 0 && "pb-20")}>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="mr-auto h-10 gap-2 sm:mr-0 sm:h-9 lg:hidden" onClick={() => setDrawerOpen(true)}>
              <ListFilter className="size-4" /> Filters
              {active > 0 && <Badge className="h-5 min-w-5 px-1.5">{active}</Badge>}
            </Button>
            <Button variant="ghost" className="hidden h-9 gap-2 text-muted-foreground lg:inline-flex" onClick={toggleSidebar}>
              {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
              {sidebarOpen ? "Hide filters" : `Show filters${active ? ` (${active})` : ""}`}
            </Button>
            <p className="order-last basis-full text-sm text-muted-foreground sm:order-none sm:mr-auto sm:basis-auto">
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
                className="h-10 gap-1.5 text-muted-foreground sm:h-9"
                aria-label={allResultsSelected ? "Unselect all" : "Select all"}
                onClick={() => (allResultsSelected ? selection.removeMany : selection.addMany)(results.map((r) => r.question.id))}
                title="Add every question in this list to the PDF"
              >
                <CheckCheck className="size-4" />
                <span className="hidden sm:inline">{allResultsSelected ? "Unselect all" : `Select all ${results.length}`}</span>
              </Button>
            )}
            <Select items={SORT_ITEMS} value={sort} onValueChange={(v) => update({}, (v as SortKey) ?? "newest")}>
              <SelectTrigger className="h-10 w-44 sm:h-9" aria-label="Sort">
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

          {active > 0 && <ActiveChips filters={filters} facets={facets} update={update} onClear={clearAll} />}

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
              <p className="font-medium">No questions match these filters</p>
              <p className="text-sm text-muted-foreground">Try removing a filter.</p>
              <Button variant="outline" onClick={clearAll}>
                Clear all filters
              </Button>
            </Card>
          ) : (
            <>
              <div className={cn("grid gap-4 transition-opacity duration-200", updating && "opacity-60")}>
                {visible.map((e) => (
                  <div key={e.key} className="card-auto">
                    <QuestionCard question={e.question} meta={e.meta} similar={similarById.get(e.question.id)} onOpenSimilar={setOpenSimilar} selectable />
                  </div>
                ))}
              </div>
              <LoadMoreSentinel enabled={visible.length < results.length} onVisible={() => setShown((n) => n + PAGE_SIZE)} />
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-muted-foreground">
                  Showing {visible.length} of {results.length}
                </p>
                <div className="flex gap-2">
                  {visible.length < results.length && (
                    <Button size="lg" variant="outline" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                      Load {Math.min(PAGE_SIZE, results.length - visible.length)} more
                    </Button>
                  )}
                  {visible.length > 5 && (
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

      {/* A similar question opens right here (with its own similar list, so students can keep going) */}
      <Dialog open={!!openSimilar} onOpenChange={(o) => !o && setOpenSimilar(null)}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-none gap-0 overflow-y-auto p-0 sm:w-full sm:max-w-3xl lg:max-h-[90vh]">
          <DialogTitle className="sr-only">Similar question</DialogTitle>
          {openSimilar && (
            <QuestionCard
              key={openSimilar.key}
              className="rounded-none border-0 ring-0 [&>div:first-child]:pr-12"
              question={openSimilar.question}
              meta={openSimilar.meta}
              similar={similarById.get(openSimilar.question.id)}
              onOpenSimilar={setOpenSimilar}
              selectable
            />
          )}
        </DialogContent>
      </Dialog>

      <SelectionBar ids={selected} byId={byId} />

      {/* Drawer (mobile / tablet) */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[90vw] max-w-sm gap-0 p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2">
              <ListFilter className="size-4" /> Filters
              {active > 0 && (
                <button type="button" onClick={clearAll} className="mr-8 ml-auto text-xs font-medium text-primary hover:underline">
                  Clear all
                </button>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <FilterPanel {...panelProps} hideHeader />
          </div>
          <SheetFooter className="border-t">
            <Button size="lg" onClick={() => setDrawerOpen(false)}>
              Show {results.length} question{results.length === 1 ? "" : "s"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- sidebar

const FilterPanel = memo(function FilterPanel({
  filters,
  facets,
  update,
  active,
  onClear,
  hideHeader = false,
}: {
  filters: Filters;
  facets: Facets;
  update: (next: Partial<Filters>) => void;
  active: number;
  onClear: () => void;
  hideHeader?: boolean;
}) {
  const multi = (key: MultiKey) => ({
    value: filters[key],
    onToggle: (v: string) => update({ [key]: filters[key].includes(v) ? filters[key].filter((x) => x !== v) : [...filters[key], v] } as Partial<Filters>),
    onClear: () => update({ [key]: [] } as Partial<Filters>),
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)]">
      <div className={cn("flex items-center justify-between px-4 pt-4 pb-2", hideHeader && "hidden")}>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ListFilter className="size-4" /> Filters
        </span>
        {active > 0 && (
          <button type="button" onClick={onClear} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            Clear all
          </button>
        )}
      </div>

      <FilterSection title="Board" selected={filters.board ? 1 : 0}>
        <RadioList options={facets.boards} value={filters.board} allLabel="All boards" onChange={(v) => update({ board: v, curriculum: null, subject: null, topic: [] })} />
      </FilterSection>
      <FilterSection title="Level" selected={filters.curriculum ? 1 : 0}>
        <RadioList options={facets.curriculums} value={filters.curriculum} allLabel="All levels" onChange={(v) => update({ curriculum: v, subject: null, topic: [] })} />
      </FilterSection>
      <FilterSection title="Subject" selected={filters.subject ? 1 : 0}>
        <RadioList options={facets.subjects} value={filters.subject} allLabel="All subjects" onChange={(v) => update({ subject: v, topic: [] })} />
      </FilterSection>
      <FilterSection title="Topic" selected={filters.topic.length}>
        <CheckList options={facets.topics} {...multi("topic")} searchable />
      </FilterSection>
      <FilterSection title="Paper" selected={filters.paper.length}>
        <CheckList options={facets.papers} {...multi("paper")} />
      </FilterSection>
      <FilterSection title="Year" selected={filters.year.length}>
        <CheckList options={facets.years} {...multi("year")} columns />
      </FilterSection>
      <FilterSection title="Season" selected={filters.season.length}>
        <CheckList options={facets.seasons} {...multi("season")} />
      </FilterSection>
      <FilterSection title="Question type" selected={filters.type.length}>
        <CheckList options={facets.types} {...multi("type")} />
      </FilterSection>
      <FilterSection title="Difficulty" selected={filters.difficulty.length} last>
        <DifficultyPills options={facets.difficulties} {...multi("difficulty")} />
      </FilterSection>
    </div>
  );
});

function FilterSection({ title, selected, last, children }: { title: string; selected: number; last?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={cn("border-t px-4", last && "pb-2")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 py-3 text-left">
        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
          {selected > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">{selected}</span>}
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", !open && "-rotate-90")} />
      </button>
      <Collapse open={open}>
        <div className="pb-3">{children}</div>
      </Collapse>
    </div>
  );
}

function RadioList({ options, value, allLabel, onChange }: { options: FacetOption[]; value: string | null; allLabel: string; onChange: (v: string | null) => void }) {
  const total = options.reduce((s, o) => s + o.count, 0);
  const rows = [{ value: null as string | null, label: allLabel, count: total }, ...options];
  return (
    <div role="radiogroup" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
      {rows.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value ?? "all"}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn("flex items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-[15px] transition-colors hover:bg-muted lg:py-1.5 lg:text-sm", on && "bg-primary/5 font-medium")}
          >
            <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", on && "border-primary")}>
              {on && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

const COLLAPSED_ROWS = 6;

function CheckList({
  options,
  value,
  onToggle,
  onClear,
  searchable,
  columns,
}: {
  options: FacetOption[];
  value: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
  searchable?: boolean;
  columns?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  if (options.length === 0) return <p className="px-2 text-xs text-muted-foreground">Nothing to filter yet</p>;

  const q = query.trim().toLowerCase();
  const matched = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const limit = expanded || q || columns ? matched.length : COLLAPSED_ROWS;
  const rows = matched.slice(0, limit);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
      {searchable && options.length > COLLAPSED_ROWS && (
        <div className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-3.5 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm" />
        </div>
      )}
      <div className={cn("grid gap-0.5", columns ? "grid-cols-[repeat(2,minmax(0,1fr))]" : "grid-cols-[minmax(0,1fr)]")}>
        {rows.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(o.value)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-[15px] transition-colors hover:bg-muted lg:py-1.5 lg:text-sm",
                o.count === 0 && !on && "opacity-50",
                on && "font-medium",
              )}
            >
              <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border transition-colors", on && "border-primary bg-primary text-primary-foreground")}>
                {on && <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate" title={o.label}>
                {o.label}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 px-2">
        {!q && !columns && matched.length > COLLAPSED_ROWS && (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="text-xs font-medium text-primary hover:underline">
            {expanded ? "Show less" : `Show all ${matched.length}`}
          </button>
        )}
        {value.length > 0 && (
          <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function DifficultyPills({ options, value, onToggle }: { options: FacetOption[]; value: string[]; onToggle: (v: string) => void; onClear: () => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["EASY", "MEDIUM", "HARD"] as const).map((d) => {
        const opt = options.find((o) => o.value === d);
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(d)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors hover:bg-muted lg:px-3 lg:py-1",
              on && cn("border-transparent font-medium", difficultyStyle[d]),
              !opt?.count && !on && "opacity-50",
            )}
          >
            {difficultyLabel(d)}
            <span className="text-xs tabular-nums opacity-70">{opt?.count ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- chips + empty state

function ActiveChips({ filters, facets, update, onClear }: { filters: Filters; facets: Facets; update: (next: Partial<Filters>) => void; onClear: () => void }) {
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.board) chips.push({ key: "board", label: filters.board, remove: () => update({ board: null, curriculum: null, subject: null, topic: [] }) });
  if (filters.curriculum) chips.push({ key: "curriculum", label: filters.curriculum, remove: () => update({ curriculum: null }) });
  if (filters.subject) {
    const s = facets.subjects.find((o) => o.value === filters.subject);
    chips.push({ key: "subject", label: s?.label ?? filters.subject, remove: () => update({ subject: null, topic: [] }) });
  }
  const groups: { key: MultiKey; options: FacetOption[]; format?: (o: FacetOption) => string }[] = [
    { key: "topic", options: facets.topics },
    { key: "paper", options: facets.papers, format: (o) => o.label.split(" · ")[0] },
    { key: "year", options: facets.years },
    { key: "season", options: facets.seasons },
    { key: "type", options: facets.types },
    { key: "difficulty", options: facets.difficulties, format: (o) => difficultyLabel(o.value as "EASY") },
  ];
  for (const { key, options, format } of groups) {
    for (const v of filters[key]) {
      const opt = options.find((o) => o.value === v) ?? { value: v, label: v, count: 0 };
      chips.push({ key: `${key}-${v}`, label: format ? format(opt) : opt.label, remove: () => update({ [key]: filters[key].filter((x) => x !== v) } as Partial<Filters>) });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.remove}
          className="flex max-w-full items-center gap-1 rounded-full bg-primary/10 py-1 pr-2 pl-3 text-sm text-primary transition-colors hover:bg-primary/15"
        >
          <span className="truncate">{c.label}</span>
          <X className="size-3.5 shrink-0" />
        </button>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={onClear} className="px-1 text-sm text-muted-foreground hover:text-foreground">
          Clear all
        </button>
      )}
    </div>
  );
}

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
