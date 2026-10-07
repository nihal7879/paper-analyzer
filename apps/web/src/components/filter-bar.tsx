import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { YearRange, type Update } from "@/components/bank-filters";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { difficultyLabel } from "@/lib/format";
import { activeFilterCount, buildFacets, EMPTY_FILTERS, filterEntries, fixChain, splitSubKey, type BankEntry, type FacetOption, type Filters, type MultiKey } from "@/lib/question-bank";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- search (an icon until clicked)

/** 🔍 that opens into a search box. Stays open while it has text; "/" opens it from the keyboard. */
export function SearchToggle({ value, onChange, open, onOpenChange }: { value: string; onChange: (v: string) => void; open: boolean; onOpenChange: (o: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const expanded = open || value !== "";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && t?.tagName !== "INPUT" && t?.tagName !== "TEXTAREA" && !t?.isContentEditable) {
        e.preventDefault();
        onOpenChange(true);
        requestAnimationFrame(() => ref.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  if (!expanded)
    return (
      <Button
        variant="outline"
        size="icon"
        className="size-10 shrink-0 sm:size-9"
        aria-label="Search questions"
        title="Search (/)"
        onClick={() => {
          onOpenChange(true);
          requestAnimationFrame(() => ref.current?.focus());
        }}
      >
        <Search className="size-4" />
      </Button>
    );

  return (
    <div className="search-open flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3 shadow-xs transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 sm:h-9 sm:max-w-md">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={ref}
        autoFocus
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => !value && onOpenChange(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onChange("");
            onOpenChange(false);
          }
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="Search questions, e.g. resistivity…"
        aria-label="Search questions"
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      <button
        type="button"
        // mousedown: runs before the input's blur, so one tap clears and closes
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          onChange("");
          onOpenChange(false);
        }}
        className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Close search"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- one dropdown

function Dropdown({ label, summary, disabled, wide, children }: { label: string; summary: string | null; disabled?: boolean; wide?: boolean; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex h-11 min-w-0 items-center gap-2 rounded-lg border bg-background px-3 text-left transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50 data-popup-open:border-ring data-popup-open:ring-3 data-popup-open:ring-ring/30 sm:h-10",
          summary && "border-primary/40 bg-primary/5",
        )}
      >
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
          <span className={cn("truncate text-sm", summary ? "font-medium text-primary" : "text-foreground")}>{summary ?? "All"}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-popup-open]>&]:rotate-180" />
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("max-h-[min(60dvh,420px)] gap-1 overflow-y-auto p-1.5", wide ? "w-[min(92vw,26rem)]" : "w-[min(92vw,18rem)]")}>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

type Opt = { value: string; label: string; count: number; group?: string };

// Mouse / trackpad: the Find box is ready to type in. Phones: no keyboard popping up on every dropdown.
const FINE_POINTER = typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

/** The options inside a dropdown: tick + label + question count. Long lists get a "find" box. */
function OptionList({ options, selected, multi, onPick, allLabel, searchable, empty = "Nothing here yet" }: { options: Opt[]; selected: string[]; multi?: boolean; onPick: (v: string | null) => void; allLabel?: string; searchable?: boolean; empty?: string }) {
  const [q, setQ] = useState("");
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()) || o.group?.toLowerCase().includes(q.toLowerCase())) : options;
  const row = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted";
  let lastGroup: string | undefined;
  return (
    <>
      {(searchable || options.length > 8) && (
        <div className="sticky -top-1.5 z-10 -mx-1.5 -mt-1.5 mb-1 border-b bg-popover p-1.5">
          <div className="flex h-8 items-center gap-2 rounded-md border bg-background px-2">
            <Search className="size-3.5 text-muted-foreground" />
            <input autoFocus={FINE_POINTER} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find…" aria-label="Find" className="w-full bg-transparent text-base outline-none sm:text-sm" />
          </div>
        </div>
      )}
      {allLabel && !q && (
        <button type="button" className={cn(row, selected.length === 0 && "text-primary")} onClick={() => onPick(null)}>
          <Check className={cn("size-4 shrink-0", selected.length ? "opacity-0" : "")} />
          <span className="flex-1">{allLabel}</span>
        </button>
      )}
      {shown.length === 0 && <p className="px-2.5 py-2 text-xs text-muted-foreground">{q ? `Nothing matches “${q}”` : empty}</p>}
      {shown.map((o) => {
        const on = selected.includes(o.value);
        const head = o.group && o.group !== lastGroup ? o.group : null;
        lastGroup = o.group;
        return (
          <div key={o.value}>
            {head && <p className="mt-1 truncate px-2.5 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{head}</p>}
            <button type="button" role={multi ? "checkbox" : "option"} aria-checked={on} className={cn(row, on && "text-primary", o.count === 0 && !on && "opacity-50")} onClick={() => onPick(o.value)}>
              {multi ? (
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25")}>
                  {on && <Check className="size-3" />}
                </span>
              ) : (
                <Check className={cn("size-4 shrink-0", !on && "opacity-0")} />
              )}
              <span className="line-clamp-2 min-w-0 flex-1 break-words">{o.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>
            </button>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- the panel

const summarize = (labels: string[]) => (labels.length === 0 ? null : labels.length === 1 ? labels[0] : `${labels.length} selected`);
const labelOf = (opts: FacetOption[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

/**
 * "Filters" panel: dropdowns in a row (a bottom sheet on phones).
 * Board → Level → Subject → Topic → Subtopic depend on each other: each lists only what exists under
 * the choices before it, and changing an earlier one drops later choices that no longer fit.
 */
export const FilterPanel = memo(function FilterPanel({
  open,
  onClose,
  pool,
  filters,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  pool: BankEntry[];
  filters: Filters;
  onApply: (next: Omit<Filters, "q">) => void;
}) {
  if (!open) return null;
  return <PanelBody pool={pool} applied={filters} onClose={onClose} onApply={onApply} />;
});

/**
 * The panel's choices are a draft: the question list only changes on "Done" (phones: "Show N questions").
 * Closing with ✕, outside or Esc forgets them.
 */
function PanelBody({ pool, applied, onClose, onApply }: { pool: BankEntry[]; applied: Filters; onClose: () => void; onApply: (next: Omit<Filters, "q">) => void }) {
  const [draft, setDraft] = useState(applied);
  // the search box stays live outside the panel; counts here follow it
  const filters = useMemo(() => ({ ...draft, q: applied.q }), [draft, applied.q]);
  const update: Update = useCallback((next) => setDraft((d) => ({ ...d, ...next })), []);
  const facets = useMemo(() => buildFacets(pool, filters), [pool, filters]);
  const resultCount = useMemo(() => filterEntries(pool, filters).length, [pool, filters]);
  const active = activeFilterCount(filters);
  // Picking a subject also sets its board and level; its topics and paper numbers reset with it.
  const onCourse = (course: string | null) => {
    const e = course ? pool.find((x) => x.meta.subjectCode === course) : undefined;
    update(e ? { course, board: e.meta.board, level: e.meta.curriculum, topic: [], sub: [], paper: [] } : { course: null, topic: [], sub: [], paper: [] });
  };
  const onClear = () => setDraft((d) => ({ ...EMPTY_FILTERS, q: d.q }));
  const apply = () => {
    const { q: _q, ...rest } = filters;
    onApply(rest);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[data-slot=popover-content]") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chain = (next: Partial<Filters>) => update(fixChain(pool, { ...filters, ...next }));
  const toggleMulti = (key: MultiKey, v: string | null) =>
    update({ [key]: v === null ? [] : filters[key].includes(v) ? filters[key].filter((x) => x !== v) : [...filters[key], v] } as Partial<Filters>);

  // Topics chosen = whole topics + topics of chosen subtopics
  const subTopics = filters.sub.map((k) => splitSubKey(k).topic);
  const chosenTopics = [...new Set([...filters.topic, ...subTopics])];
  const topicOpts: Opt[] = facets.topics.map((n) => ({ value: n.topic, label: n.label, count: n.count }));
  const subNodes = chosenTopics.length ? facets.topics.filter((n) => chosenTopics.includes(n.topic)) : facets.topics;
  const subOpts: Opt[] = subNodes.flatMap((n) => n.subs.map((s) => ({ value: s.key, label: s.name, count: s.count, group: n.label })));

  const pickTopic = (t: string | null) => {
    if (t === null) return update({ topic: [], sub: [] });
    if (chosenTopics.includes(t)) update({ topic: filters.topic.filter((x) => x !== t), sub: filters.sub.filter((k) => splitSubKey(k).topic !== t) });
    else update({ topic: [...filters.topic, t] });
  };
  const pickSub = (key: string | null) => {
    if (key === null) return update({ sub: [], topic: chosenTopics });
    const t = splitSubKey(key).topic;
    if (filters.sub.includes(key)) {
      const rest = filters.sub.filter((k) => k !== key);
      // last subtopic of a topic removed: keep the topic itself chosen
      const keepTopic = !rest.some((k) => splitSubKey(k).topic === t) && !filters.topic.includes(t);
      update({ sub: rest, topic: keepTopic ? [...filters.topic, t] : filters.topic });
    } else update({ sub: [...filters.sub, key], topic: filters.topic.filter((x) => x !== t) });
  };

  const yearSummary =
    filters.yearFrom != null || filters.yearTo != null
      ? `${filters.yearFrom ?? facets.yearBounds?.min ?? ""} – ${filters.yearTo ?? facets.yearBounds?.max ?? ""}`
      : null;
  const topicLabel = (t: string) => facets.topics.find((n) => n.topic === t)?.label ?? t;

  return (
    <>
      {/* phones: dim the page behind the sheet; tap it to close */}
      <button type="button" aria-label="Close filters" className="fade-in fixed inset-0 z-[45] bg-black/30 sm:hidden" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Filters"
        className="sheet-up z-[46] grid gap-3 rounded-xl border bg-card p-3 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[85dvh] max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:p-4 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] max-sm:shadow-[0_-12px_40px_rgba(0,0,0,0.15)] sm:p-4"
      >
        <div className="flex items-center gap-2 sm:hidden">
          <span className="text-base font-semibold">Filters</span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Dropdown label="Board" summary={filters.board}>
            {(close) => (
              <OptionList
                searchable
                allLabel="All boards"
                options={facets.boards}
                selected={filters.board ? [filters.board] : []}
                onPick={(v) => {
                  chain({ board: v === filters.board ? null : v });
                  close();
                }}
              />
            )}
          </Dropdown>
          <Dropdown label="Level" summary={filters.level}>
            {(close) => (
              <OptionList
                searchable
                allLabel="All levels"
                options={facets.levels}
                selected={filters.level ? [filters.level] : []}
                onPick={(v) => {
                  chain({ level: v === filters.level ? null : v });
                  close();
                }}
              />
            )}
          </Dropdown>
          <Dropdown label="Subject" summary={filters.course ? labelOf(facets.subjects, filters.course) : null}>
            {(close) => (
              <OptionList
                searchable
                allLabel="All subjects"
                options={facets.subjects}
                selected={filters.course ? [filters.course] : []}
                onPick={(v) => {
                  onCourse(v === filters.course ? null : v);
                  close();
                }}
              />
            )}
          </Dropdown>
          <Dropdown label="Topic" summary={summarize(chosenTopics.map(topicLabel))} wide>
            {() => <OptionList multi searchable allLabel="All topics" options={topicOpts} selected={chosenTopics} onPick={pickTopic} />}
          </Dropdown>
          <Dropdown label="Subtopic" summary={summarize(filters.sub.map((k) => splitSubKey(k).subtopic))} wide>
            {() => <OptionList multi searchable allLabel="All subtopics" options={subOpts} selected={filters.sub} onPick={pickSub} />}
          </Dropdown>

          <Dropdown label="Year" summary={yearSummary} wide>
            {() => (
              <div className="p-2">
                <YearRange bounds={facets.yearBounds} counts={facets.yearCounts} from={filters.yearFrom} to={filters.yearTo} update={update} />
              </div>
            )}
          </Dropdown>
          <Dropdown label="Season" summary={summarize(filters.season.map((v) => labelOf(facets.seasons, v)))}>
            {() => <OptionList multi allLabel="All seasons" options={facets.seasons} selected={filters.season} onPick={(v) => toggleMulti("season", v)} />}
          </Dropdown>
          <Dropdown label="Paper" summary={summarize(filters.paper.map((v) => `Paper ${v}`))} wide>
            {() => <OptionList multi searchable allLabel="All papers" options={facets.papers} selected={filters.paper} onPick={(v) => toggleMulti("paper", v)} />}
          </Dropdown>
          <Dropdown label="Type" summary={summarize(filters.type.map((v) => labelOf(facets.types, v)))}>
            {() => <OptionList multi allLabel="All types" options={facets.types} selected={filters.type} onPick={(v) => toggleMulti("type", v)} />}
          </Dropdown>
          <Dropdown label="Difficulty" summary={summarize(filters.difficulty.map((d) => difficultyLabel(d as "EASY")))}>
            {() => (
              <OptionList
                multi
                allLabel="All difficulties"
                options={facets.difficulties.map((o) => ({ ...o, label: difficultyLabel(o.value as "EASY") }))}
                selected={filters.difficulty}
                onPick={(v) => toggleMulti("difficulty", v)}
              />
            )}
          </Dropdown>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" className="h-10 text-muted-foreground sm:h-9" disabled={active === 0} onClick={onClear}>
            Clear all
          </Button>
          <Button className="ml-auto h-10 sm:hidden" onClick={apply}>
            Show {resultCount} question{resultCount === 1 ? "" : "s"}
          </Button>
          <span className="ml-auto hidden text-sm text-muted-foreground tabular-nums sm:inline">
            <b className="text-foreground">{resultCount}</b> question{resultCount === 1 ? "" : "s"} match
          </span>
          <Button variant="ghost" className="hidden h-9 sm:inline-flex" onClick={onClose}>
            Cancel
          </Button>
          <Button className="hidden h-9 sm:inline-flex" onClick={apply}>
            Done
          </Button>
        </div>
      </div>
    </>
  );
}

/** The "Filters" button (shows how many filters are on). */
export function FiltersButton({ open, active, onClick }: { open: boolean; active: number; onClick: () => void }) {
  return (
    <Button variant="outline" aria-expanded={open} onClick={onClick} className={cn("h-10 shrink-0 gap-1.5 sm:h-9", (open || active > 0) && "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10")}>
      <SlidersHorizontal className="size-4" />
      Filters
      {active > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">{active}</span>}
    </Button>
  );
}
