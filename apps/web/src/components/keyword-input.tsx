import { X } from "lucide-react";
import { useState } from "react";

/** Chips + input: Enter or comma adds, Backspace on empty input removes the last one. */
export function KeywordInput({ value, onChange, id }: { value: string[]; onChange: (value: string[]) => void; id?: string }) {
  const [text, setText] = useState("");

  function add(raw: string) {
    const words = raw
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w && !value.includes(w));
    if (words.length) onChange([...value, ...words]);
    setText("");
  }

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      {value.map((k) => (
        <span key={k} className="flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2 text-xs font-medium">
          {k}
          <button type="button" aria-label={`Remove ${k}`} onClick={() => onChange(value.filter((x) => x !== k))} className="rounded p-0.5 hover:bg-muted-foreground/15">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => text && add(text)}
        placeholder={value.length ? "Add…" : "e.g. momentum, impulse"}
        className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
