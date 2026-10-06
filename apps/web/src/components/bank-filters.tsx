import { Slider } from "@base-ui/react/slider";
import { AlignLeft, CalendarDays, CalendarRange, Check, ChevronDown, ChevronRight, Gauge, GraduationCap, ListFilter, Minus, Search, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { Collapse } from "@/components/collapse";
import { difficultyLabel, difficultyStyle } from "@/lib/format";
import { splitSubKey, type FacetOption, type Facets, type Filters, type MultiKey, type TopicNode } from "@/lib/question-bank";
import { cn } from "@/lib/utils";

type Update = (next: Partial<Filters>) => void;

function Radio({ on }: { on: boolean }) {
  return (
    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors", on && "border-primary")}>
      {on && <span className="size-2 rounded-full bg-primary" />}
    </span>
  );
}

// ---------------------------------------------------------------- search

/** Search box: results follow as you type; "/" jumps here on a keyboard. */
export function SearchBox({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && t?.tagName !== "INPUT" && t?.tagName !== "TEXTAREA" && !t?.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={cn(
        "flex h-10 min-w-0 items-center gap-2 rounded-lg border bg-background px-3 shadow-xs transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={ref}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="Search questions, e.g. resistivity, projectile…"
        aria-label="Search questions"
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clear search">
          <X className="size-4" />
        </button>
      ) : (
        <kbd className="hidden rounded border bg-muted px-1.5 font-sans text-[11px] text-muted-foreground lg:inline">/</kbd>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- filter sections (shared by the rail and the accordion)

type SectionId = "course" | "topic" | "year" | "exam" | "type";
const SECTIONS: { id: SectionId; title: string; short: string; icon: typeof GraduationCap }[] = [
  { id: "course", title: "Course", short: "Course", icon: GraduationCap },
  { id: "topic", title: "Topic", short: "Topic", icon: AlignLeft },
  { id: "year", title: "Year", short: "Year", icon: CalendarRange },
  { id: "exam", title: "Paper & season", short: "Season", icon: CalendarDays },
  { id: "type", title: "Type & difficulty", short: "Type", icon: Gauge },
];

/** One-line "what is picked" per section (null = nothing, shown as "All"). */
function sectionSummaries(filters: Filters, facets: Facets): Record<SectionId, string | null> {
  const label = (opts: FacetOption[], v: string) => opts.find((o) => o.value === v)?.label.split(" · ")[0] ?? v;
  const list = (xs: string[]) => (xs.length === 0 ? null : xs.length <= 2 ? xs.join(", ") : `${xs[0]} +${xs.length - 1}`);
  const subject = filters.course ? label(facets.subjects, filters.course).replace(/ \(.*\)$/, "") : null;
  return {
    course: subject ?? filters.level ?? filters.board,
    topic: list([...filters.topic, ...filters.sub.map((k) => splitSubKey(k).subtopic)]),
    year: filters.yearFrom != null || filters.yearTo != null ? `${filters.yearFrom ?? facets.yearBounds?.min} – ${filters.yearTo ?? facets.yearBounds?.max}` : null,
    exam: list([...filters.paper.map((v) => label(facets.papers, v)), ...filters.season.map((v) => label(facets.seasons, v))]),
    type: list([...filters.type.map((v) => label(facets.types, v)), ...filters.difficulty.map((d) => difficultyLabel(d as "EASY"))]),
  };
}

/** How many things are picked in a section (the badge on the rail icon). */
function sectionCount(id: SectionId, f: Filters): number {
  if (id === "course") return [f.board, f.level, f.course].filter(Boolean).length;
  if (id === "topic") return f.topic.length + f.sub.length;
  if (id === "year") return f.yearFrom != null || f.yearTo != null ? 1 : 0;
  if (id === "exam") return f.paper.length + f.season.length;
  return f.type.length + f.difficulty.length;
}

const SubLabel = ({ children, first }: { children: React.ReactNode; first?: boolean }) => (
  <span className={cn("px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase", !first && "pt-1")}>{children}</span>
);

function SectionBody({ id, filters, facets, update, onCourse }: { id: SectionId; filters: Filters; facets: Facets; update: Update; onCourse: (c: string | null) => void }) {
  const multi = (key: MultiKey) => ({
    value: filters[key],
    onToggle: (v: string) => update({ [key]: filters[key].includes(v) ? filters[key].filter((x) => x !== v) : [...filters[key], v] } as Partial<Filters>),
  });
  if (id === "course")
    return (
      <>
        <SubLabel first>Board</SubLabel>
        <RadioList options={facets.boards} value={filters.board} allLabel="All boards" onChange={(v) => update({ board: v, level: null, course: null, topic: [], sub: [], paper: [] })} />
        <SubLabel>Level</SubLabel>
        <RadioList options={facets.levels} value={filters.level} allLabel="All levels" onChange={(v) => update({ level: v, course: null, topic: [], sub: [], paper: [] })} />
        <SubLabel>Subject</SubLabel>
        <RadioList options={facets.subjects} value={filters.course} allLabel="All subjects" onChange={onCourse} />
      </>
    );
  if (id === "topic") return <TopicTree nodes={facets.topics} filters={filters} update={update} />;
  if (id === "year") return <YearRange bounds={facets.yearBounds} counts={facets.yearCounts} from={filters.yearFrom} to={filters.yearTo} update={update} />;
  if (id === "exam")
    return (
      <>
        <SubLabel first>Paper</SubLabel>
        <ChipGroup options={facets.papers} format={(o) => o.label.split(" · ")[0]} {...multi("paper")} />
        <SubLabel>Season</SubLabel>
        <ChipGroup options={facets.seasons} {...multi("season")} />
      </>
    );
  return (
    <>
      <SubLabel first>Question type</SubLabel>
      <ChipGroup options={facets.types} {...multi("type")} />
      <SubLabel>Difficulty</SubLabel>
      <DifficultyPills options={facets.difficulties} {...multi("difficulty")} />
    </>
  );
}

// ---------------------------------------------------------------- icon rail + fly-out

/**
 * Filters as a slim icon rail: laptop = a column on the left with the panel flying out beside it;
 * phone / tablet = a row of icon tabs with the panel opening underneath. Badges show what is set.
 */
export const FilterRail = memo(function FilterRail({
  filters,
  facets,
  update,
  active,
  onClear,
  onCourse,
}: {
  filters: Filters;
  facets: Facets;
  update: Update;
  active: number;
  onClear: () => void;
  onCourse: (course: string | null) => void;
}) {
  const [open, setOpen] = useState<SectionId | null>(null);
  const summary = sectionSummaries(filters, facets);
  const sec = SECTIONS.find((x) => x.id === open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <nav
        aria-label="Filters"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-start justify-around border-t bg-card/95 px-1 pt-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur lg:relative lg:inset-auto lg:h-auto lg:flex-col lg:items-stretch lg:justify-start lg:gap-1 lg:rounded-2xl lg:border lg:bg-card lg:p-2 lg:shadow-none lg:backdrop-blur-none"
      >
        {SECTIONS.map(({ id, short, icon: Icon }) => {
          const n = sectionCount(id, filters);
          const on = open === id;
          return (
            <button
              key={id}
              type="button"
              aria-expanded={on}
              onClick={() => setOpen(on ? null : id)}
              title={summary[id] ? `${short}: ${summary[id]}` : short}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium text-muted-foreground transition-[background-color,color,scale] duration-150 hover:bg-muted hover:text-foreground active:scale-95 lg:flex-none lg:px-2 lg:py-2.5 lg:text-[11.5px]",
                n > 0 && "text-primary",
                on && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              {n > 0 && (
                <span className={cn("absolute top-1 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground", on && "bg-primary-foreground text-primary")}>
                  {n}
                </span>
              )}
              <Icon className="size-5" />
              {short}
            </button>
          );
        })}
        {active > 0 && (
          <button
            type="button"
            onClick={() => {
              onClear();
              setOpen(null);
            }}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex-none lg:px-2 lg:py-2.5 lg:text-[11.5px]"
          >
            <X className="size-5" />
            Clear
          </button>
        )}
      </nav>

      {sec && (
        <>
          {/* click outside closes */}
          <button type="button" aria-label="Close filter" className="fixed inset-0 z-30 cursor-default bg-black/25 lg:bg-transparent" onClick={() => setOpen(null)} />
          <div
            role="dialog"
            aria-label={sec.title}
            className="panel-scroll sheet-up fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 grid max-h-[65dvh] grid-cols-[minmax(0,1fr)] gap-1.5 overflow-y-auto rounded-t-2xl border-t bg-popover p-4 shadow-[0_-12px_40px_rgba(0,0,0,0.15)] lg:absolute lg:inset-x-auto lg:top-0 lg:bottom-auto lg:left-[calc(100%+12px)] lg:max-h-[calc(100vh-7rem)] lg:w-[340px] lg:rounded-2xl lg:border lg:shadow-xl"
          >
            <div key={sec.id} className="fade-in grid grid-cols-[minmax(0,1fr)] gap-1.5">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[15px] font-semibold">{sec.title}</span>
              {summary[sec.id] && <span className="truncate text-xs font-medium text-primary">{summary[sec.id]}</span>}
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <SectionBody id={sec.id} filters={filters} facets={facets} update={update} onCourse={onCourse} />
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// ---------------------------------------------------------------- side panel (accordion)

export const FilterPanel = memo(function FilterPanel({
  filters,
  facets,
  update,
  active,
  onClear,
  onCourse,
  hideHeader = false,
}: {
  filters: Filters;
  facets: Facets;
  update: Update;
  active: number;
  onClear: () => void;
  /** Picking a subject = picking the course (remembered, resets topics). */
  onCourse: (course: string | null) => void;
  hideHeader?: boolean;
}) {
  // One section open at a time; all closed when the page loads.
  const [openSec, setOpenSec] = useState<string | null>(null);
  const summary = sectionSummaries(filters, facets);
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

      <div className={cn(!hideHeader && "border-t")}>
        {SECTIONS.map((sec) => (
          <AccordionSection key={sec.id} id={sec.id} title={sec.title} summary={summary[sec.id]} open={openSec} onToggle={setOpenSec}>
            <SectionBody id={sec.id} filters={filters} facets={facets} update={update} onCourse={onCourse} />
          </AccordionSection>
        ))}
      </div>
    </div>
  );
});

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
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-[15px] transition-colors hover:bg-muted lg:py-1.5 lg:text-sm",
              on && "bg-primary/5 text-primary",
            )}
          >
            <Radio on={on} />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One accordion section: title + what is picked ("All" when nothing) + chevron. Opening one closes the others. */
function AccordionSection({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string | null;
  open: string | null;
  onToggle: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => onToggle(isOpen ? null : id)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
      >
        <span className="text-[15px] font-semibold lg:text-sm">{title}</span>
        <span className={cn("ml-auto max-w-[55%] truncate text-sm lg:text-[13px]", summary ? "font-semibold text-primary" : "text-muted-foreground")}>{summary ?? "All"}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
      </button>
      <Collapse open={isOpen}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 px-3 pb-4">{children}</div>
      </Collapse>
    </div>
  );
}

function CheckBox({ state }: { state: "on" | "off" | "some" }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
        state !== "off" && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {state === "on" && <Check className="size-3" />}
      {state === "some" && <Minus className="size-3" />}
    </span>
  );
}

// ---------------------------------------------------------------- topic tree

function TopicTree({ nodes, filters, update }: { nodes: TopicNode[]; filters: Filters; update: Update }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(filters.sub.map((k) => splitSubKey(k).topic)));
  if (nodes.length === 0) return <p className="px-2 text-xs text-muted-foreground">Nothing to filter yet</p>;

  const q = query.trim().toLowerCase();
  const visible = nodes
    .map((n) => {
      if (!q) return n;
      const topicHit = n.label.toLowerCase().includes(q);
      const subs = n.subs.filter((s) => topicHit || s.name.toLowerCase().includes(q));
      return subs.length || topicHit ? { ...n, subs } : null;
    })
    .filter((n): n is TopicNode => n !== null);

  function toggleTopic(n: TopicNode) {
    const on = filters.topic.includes(n.topic);
    update({
      topic: on ? filters.topic.filter((t) => t !== n.topic) : [...filters.topic, n.topic],
      sub: filters.sub.filter((k) => splitSubKey(k).topic !== n.topic),
    });
  }
  function toggleSub(n: TopicNode, key: string) {
    const all = n.subs.map((s) => s.key);
    let subs = filters.sub;
    let topics = filters.topic;
    // Whole topic was on: switch to "every subtopic except this one"
    if (topics.includes(n.topic)) {
      topics = topics.filter((t) => t !== n.topic);
      subs = [...subs, ...all.filter((k) => k !== key)];
    } else subs = subs.includes(key) ? subs.filter((k) => k !== key) : [...subs, key];
    // Every subtopic ticked = the whole topic
    if (all.length > 1 && all.every((k) => subs.includes(k))) {
      subs = subs.filter((k) => !all.includes(k));
      topics = [...topics, n.topic];
    }
    update({ topic: topics, sub: subs });
  }
  const toggleOpen = (topic: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });

  const rowCls = "flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-2.5 pr-2 text-left text-[15px] transition-colors hover:bg-muted lg:py-1.5 lg:text-sm";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
      <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-2 focus-within:ring-2 focus-within:ring-ring/40 lg:h-8">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a topic…"
          aria-label="Find a topic"
          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground" aria-label="Clear">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {visible.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No topic matches “{query}”</p>}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
        {visible.map((n) => {
          const whole = filters.topic.includes(n.topic);
          const some = !whole && n.subs.some((s) => filters.sub.includes(s.key));
          const open = !!q || expanded.has(n.topic);
          return (
            <li key={n.topic}>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => toggleOpen(n.topic)}
                  disabled={n.subs.length === 0}
                  aria-expanded={open}
                  aria-label={open ? `Hide subtopics of ${n.topic}` : `Show subtopics of ${n.topic}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:opacity-0 lg:size-7"
                >
                  <ChevronRight className={cn("size-4 transition-transform duration-200", open && "rotate-90")} />
                </button>
                <button type="button" role="checkbox" aria-checked={whole ? true : some ? "mixed" : false} onClick={() => toggleTopic(n)} className={cn(rowCls, "pl-1", n.count === 0 && !whole && !some && "opacity-50", (whole || some) && "text-primary")}>
                  <CheckBox state={whole ? "on" : some ? "some" : "off"} />
                  <span className="line-clamp-2 min-w-0 flex-1 break-words" title={n.label}>
                    {n.label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{n.count}</span>
                </button>
              </div>
              {n.subs.length > 0 && (
                <Collapse open={open}>
                  <ul className="ml-[18px] grid grid-cols-[minmax(0,1fr)] gap-0.5 border-l py-0.5 pl-2 lg:ml-[14px]">
                    {n.subs.map((s) => {
                      const on = whole || filters.sub.includes(s.key);
                      return (
                        <li key={s.key}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => toggleSub(n, s.key)}
                            className={cn(rowCls, "w-full pl-2", s.count === 0 && !on && "opacity-50", on && "text-primary")}
                          >
                            <CheckBox state={on ? "on" : "off"} />
                            <span className="line-clamp-2 min-w-0 flex-1 break-words" title={s.name}>
                              {s.name}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">{s.count}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Collapse>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- year range

function YearRange({
  bounds,
  counts,
  from,
  to,
  update,
}: {
  bounds: { min: number; max: number } | null;
  counts: Map<string, FacetOption>;
  from: number | null;
  to: number | null;
  update: Update;
}) {
  const min = bounds?.min ?? 0;
  const max = bounds?.max ?? 0;
  const committed: [number, number] = [Math.max(min, from ?? min), Math.min(max, to ?? max)];
  // Local value while dragging; the list only re-filters when the thumb is released.
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const value = draft ?? committed;
  if (!bounds) return <p className="px-2 text-xs text-muted-foreground">Nothing to filter yet</p>;

  const set = (a: number, b: number) => {
    setDraft(null);
    update({ yearFrom: a <= min ? null : a, yearTo: b >= max ? null : b });
  };
  const inRange = [...counts.values()].filter((o) => Number(o.value) >= value[0] && Number(o.value) <= value[1]).reduce((s, o) => s + o.count, 0);
  const presets = [
    { label: "Last 3 years", a: Math.max(min, max - 2), b: max },
    { label: "Last 5 years", a: Math.max(min, max - 4), b: max },
    { label: "All years", a: min, b: max },
  ].filter((p, i, all) => all.findIndex((x) => x.a === p.a && x.b === p.b) === i);

  if (min === max) return <p className="px-2 text-sm">{min}</p>;

  return (
    <div className="grid gap-3 px-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium tabular-nums">
          {value[0] === value[1] ? value[0] : `${value[0]} – ${value[1]}`}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{inRange} questions</span>
      </div>
      <Slider.Root
        value={value}
        min={min}
        max={max}
        step={1}
        onValueChange={(v) => Array.isArray(v) && setDraft([v[0], v[1]])}
        onValueCommitted={(v) => Array.isArray(v) && set(v[0], v[1])}
        className="px-2"
      >
        <Slider.Control className="flex h-7 w-full touch-none items-center select-none">
          <Slider.Track className="relative h-1.5 w-full rounded-full bg-muted">
            <Slider.Indicator className="rounded-full bg-primary" />
            {[0, 1].map((i) => (
              <Slider.Thumb
                key={i}
                index={i}
                getAriaLabel={(idx) => (idx === 0 ? "From year" : "To year")}
                className="size-5 rounded-full border-2 border-primary bg-background shadow-sm outline-none transition-[box-shadow] focus-visible:ring-4 focus-visible:ring-ring/30 data-dragging:ring-4 data-dragging:ring-ring/30"
              />
            ))}
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <div className="flex justify-between px-1 text-[11px] text-muted-foreground tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const on = committed[0] === p.a && committed[1] === p.b;
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={on}
              onClick={() => set(p.a, p.b)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted lg:py-1",
                on && "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- chips

function ChipGroup({ options, value, onToggle, format }: { options: FacetOption[]; value: string[]; onToggle: (v: string) => void; format?: (o: FacetOption) => string }) {
  if (options.length === 0) return <p className="px-2 text-xs text-muted-foreground">Nothing to filter yet</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            title={o.label}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors hover:bg-muted lg:px-3 lg:py-1",
              on && "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15",
              o.count === 0 && !on && "opacity-50",
            )}
          >
            {format ? format(o) : o.label}
            <span className="text-xs tabular-nums opacity-70">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function DifficultyPills({ options, value, onToggle }: { options: FacetOption[]; value: string[]; onToggle: (v: string) => void }) {
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
              on && cn("border-transparent", difficultyStyle[d]),
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

// ---------------------------------------------------------------- active chips

export function ActiveChips({
  filters,
  facets,
  update,
  onClear,
  onCourse,
}: {
  filters: Filters;
  facets: Facets;
  update: Update;
  onClear: () => void;
  onCourse: (course: string | null) => void;
}) {
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.board) chips.push({ key: "board", label: filters.board, remove: () => update({ board: null, level: null, course: null, topic: [], sub: [], paper: [] }) });
  if (filters.level) chips.push({ key: "level", label: filters.level, remove: () => update({ level: null, course: null, topic: [], sub: [], paper: [] }) });
  if (filters.course) {
    const c = facets.subjects.find((o) => o.value === filters.course);
    chips.push({ key: "course", label: c?.label ?? filters.course, remove: () => onCourse(null) });
  }
  for (const t of filters.topic) {
    const node = facets.topics.find((n) => n.topic === t);
    chips.push({ key: `t-${t}`, label: node?.label ?? t, remove: () => update({ topic: filters.topic.filter((x) => x !== t) }) });
  }
  for (const k of filters.sub) chips.push({ key: `s-${k}`, label: splitSubKey(k).subtopic, remove: () => update({ sub: filters.sub.filter((x) => x !== k) }) });
  if (filters.yearFrom != null || filters.yearTo != null) {
    const a = filters.yearFrom ?? facets.yearBounds?.min;
    const b = filters.yearTo ?? facets.yearBounds?.max;
    chips.push({ key: "year", label: a === b ? String(a) : `${a} – ${b}`, remove: () => update({ yearFrom: null, yearTo: null }) });
  }
  const groups: { key: MultiKey; options: FacetOption[]; format?: (o: FacetOption) => string }[] = [
    { key: "paper", options: facets.papers, format: (o) => o.label.split(" · ")[0] },
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
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.remove}
          className="enter-up flex max-w-full items-center gap-1 rounded-full bg-primary/10 py-1 pr-2 pl-3 text-sm text-primary transition-colors hover:bg-primary/15"
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
