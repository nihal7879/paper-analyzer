import { AppWindow, FileText, List, Monitor, Moon, PanelTop, Settings, Square, Sun } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  setColorTheme,
  setSimilarMode,
  setViewMode,
  useColorTheme,
  useSimilarMode,
  useViewMode,
  type ColorTheme,
  type SimilarMode,
  type ViewMode,
} from "@/lib/preferences";
import { useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string; icon?: typeof List; swatch?: string };

/** A segmented switch whose highlight slides to the chosen option. */
function SlideSwitch<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="grid gap-1.5">
      <span className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      <div role="radiogroup" aria-label={label} className="relative grid rounded-xl bg-muted/70 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {/* the sliding highlight */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 rounded-lg bg-background shadow-sm ring-1 ring-foreground/5 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
        />
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cn(
                "relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-[13px] text-muted-foreground transition-colors duration-200",
                on && "font-medium text-foreground",
              )}
            >
              {o.swatch && <span className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10" style={{ background: o.swatch }} />}
              {o.icon && <o.icon className="size-4 shrink-0" />}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** ⚙ in the top bar: how questions and similar questions show, colours and light / dark. Remembered on this device. */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const view = useViewMode();
  const similar = useSimilarMode();
  const color = useColorTheme();
  const { theme, setTheme } = useTheme();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Settings"
        title="Settings"
        className="flex size-9 items-center justify-center rounded-lg text-foreground transition-[background-color,scale] hover:bg-muted active:scale-95 data-popup-open:bg-muted"
      >
        <Settings className="size-[18px] transition-transform duration-300 group-data-popup-open:rotate-45" />
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[80dvh] w-[min(94vw,22rem)] gap-3.5 overflow-y-auto p-3.5">
        <p className="px-1 text-sm font-semibold">Settings</p>
        <SlideSwitch<ViewMode>
          label="Show questions"
          value={view}
          onChange={setViewMode}
          options={[
            { value: "list", label: "All", icon: List },
            { value: "single", label: "One at a time", icon: Square },
          ]}
        />
        <SlideSwitch<SimilarMode>
          label="Similar questions open"
          value={similar}
          onChange={setSimilarMode}
          options={[
            { value: "page", label: "New page", icon: FileText },
            { value: "modal", label: "Pop-up", icon: AppWindow },
            { value: "inline", label: "In card", icon: PanelTop },
          ]}
        />
        <SlideSwitch<ColorTheme>
          label="Colour"
          value={color}
          onChange={setColorTheme}
          options={[
            { value: "teal", label: "Teal", swatch: "#0f6b63" },
            { value: "blue", label: "Blue", swatch: "#2447d4" },
          ]}
        />
        <SlideSwitch<Theme>
          label="Appearance"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "Auto", icon: Monitor },
          ]}
        />
      </PopoverContent>
    </Popover>
  );
}
