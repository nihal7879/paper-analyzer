import { memo } from "react";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { cn } from "@/lib/utils";

// Markdown + $LaTeX$ -> HTML. Raw HTML inside the text is dropped (remark-rehype default), so this is safe to inject.
const processor = unified()
  .use(remarkParse)
  // tables (| a | b |); single ~ stays plain text (used for "approximately")
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex, { strict: "ignore" }) // bad LaTeX is shown in red, never throws
  .use(rehypeStringify);

/**
 * Rendered HTML per text. KaTeX is the most expensive part of a card, so each text is rendered once and
 * reused: re-filtering, searching and scrolling back never re-typeset the same maths.
 */
const cache = new Map<string, string>();
const MAX_CACHE = 20_000;

/**
 * A line that is only `$$ … $$` is a display formula (big, centred, like the paper). Markdown would read it as
 * small in-line maths, so it is put on its own lines first: `$$\n…\n$$`.
 */
function displayLines(text: string): string {
  return text.replace(/^[ \t]*\$\$([^\n]+?)\$\$[ \t]*$/gm, (_, tex: string) => `$$\n${tex.trim()}\n$$`);
}

function toHtml(text: string): string {
  let html = cache.get(text);
  if (html === undefined) {
    try {
      html = String(processor.processSync(displayLines(text)));
    } catch {
      html = escapeHtml(text);
    }
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(text, html);
  }
  return html;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Pre-render texts in the background (idle time, small batches) so cards appear instantly later.
 * Returns a cancel function.
 */
export function warmMath(texts: string[]): () => void {
  let i = 0;
  let cancelled = false;
  const idle: (cb: (d?: IdleDeadline) => void) => number = window.requestIdleCallback ?? ((cb) => window.setTimeout(() => cb(), 30));
  const cancelIdle: (id: number) => void = window.cancelIdleCallback ?? window.clearTimeout;
  let handle = 0;
  const step = (deadline?: IdleDeadline) => {
    const until = performance.now() + 12;
    while (!cancelled && i < texts.length && (deadline ? deadline.timeRemaining() > 2 : performance.now() < until)) toHtml(texts[i++]);
    if (!cancelled && i < texts.length) handle = idle(step);
  };
  handle = idle(step);
  return () => {
    cancelled = true;
    cancelIdle(handle);
  };
}

/** Markdown with $inline$ and $$block$$ LaTeX, rendered with KaTeX (cached). */
export const MathText = memo(function MathText({ children, className, inline = false }: { children: string; className?: string; inline?: boolean }) {
  return <div className={cn("math-text", inline && "math-text-inline", className)} dangerouslySetInnerHTML={{ __html: toHtml(children) }} />;
});
















