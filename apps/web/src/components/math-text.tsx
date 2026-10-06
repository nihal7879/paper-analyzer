import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { cn } from "@/lib/utils";

const REMARK = [remarkMath];
const REHYPE: Parameters<typeof ReactMarkdown>[0]["rehypePlugins"] = [[rehypeKatex, { throwOnError: false, strict: "ignore" }]];

/** Markdown with $inline$ and $$block$$ LaTeX, rendered with KaTeX. Memoised: KaTeX is the most expensive thing on the page. */
export const MathText = memo(function MathText({ children, className, inline = false }: { children: string; className?: string; inline?: boolean }) {
  return (
    <div className={cn("math-text", inline && "math-text-inline", className)}>
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
