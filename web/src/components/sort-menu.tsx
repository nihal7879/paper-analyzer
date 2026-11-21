import { ArrowDownUp, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatSort, parseSort, type SortGroup, type SortKey, type SortOrder } from "@/lib/question-bank";
import { cn } from "@/lib/utils";

const SORT_GROUP_LABELS: Record<SortGroup, string> = {
  difficulty: "By difficulty level",
  marks: "By marks",
  type: "By question type",
  topic: "By topic",
  board: "By curriculum & year group",
};
const SHORT: Record<SortGroup, string> = { difficulty: "Difficulty", marks: "Marks", type: "Type", topic: "Topic", board: "Curriculum" };
const ORDER_LABELS: Record<SortOrder, string> = { newest: "Newest papers first", oldest: "Oldest papers first" };

/** The button's text: "Newest papers first", or the ticked sorts in order ("Difficulty → Marks"). */
function sortSummary(sort: SortKey): string {
  const { groups, order } = parseSort(sort);
  return groups.length ? groups.map((g) => SHORT[g]).join(" → ") : ORDER_LABELS[order];
}

/**
 * Sort menu: tick any number of group sorts (the order you tick them is their priority, shown as ① ②),
 * plus newest / oldest papers first, which orders the questions inside the last group.
 */
export function SortMenu({ sort, available, onChange }: { sort: SortKey; available: SortGroup[]; onChange: (s: SortKey) => void }) {
  const { groups, order } = parseSort(sort);
  const toggle = (g: SortGroup) => onChange(formatSort(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g], order));
  const row = "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted";
  return (
    <Popover>
      <PopoverTrigger
        className="btn-soft flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[color:var(--btn-border)] bg-card px-3 text-sm font-semibold sm:h-9 sm:max-w-56"
        aria-label="Sort"
      >
        <ArrowDownUp className="size-4 shrink-0" />
        <span className="truncate max-sm:hidden">{sortSummary(sort)}</span>
        {groups.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground sm:hidden">{groups.length}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0.5 p-1.5">
        <p className="px-2 pt-1 pb-1 text-xs font-semibold text-muted-foreground">Group by (tick in order)</p>
        {available.map((g) => {
          const at = groups.indexOf(g);
          return (
            <button key={g} type="button" role="menuitemcheckbox" aria-checked={at >= 0} className={row} onClick={() => toggle(g)}>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded border text-[11px] font-semibold",
                  at >= 0 ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {at >= 0 ? (groups.length > 1 ? at + 1 : <Check className="size-3.5" />) : null}
              </span>
              {SORT_GROUP_LABELS[g]}
            </button>
          );
        })}
        <div className="my-1 h-px bg-border" />
        <p className="px-2 pt-1 pb-1 text-xs font-semibold text-muted-foreground">{groups.length ? "Inside each group" : "Order"}</p>
        {(["newest", "oldest"] as SortOrder[]).map((o) => (
          <button key={o} type="button" role="menuitemradio" aria-checked={order === o} className={row} onClick={() => onChange(formatSort(groups, o))}>
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", order === o ? "border-primary" : "border-input")}>
              {order === o && <span className="size-2.5 rounded-full bg-primary" />}
            </span>
            {ORDER_LABELS[o]}
          </button>
        ))}
        {groups.length > 0 && (
          <button type="button" className={cn(row, "justify-center text-muted-foreground")} onClick={() => onChange(order)}>
            Clear grouping
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
