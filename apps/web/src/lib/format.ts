import type { Question } from "@/lib/api";

export const difficultyStyle: Record<Question["difficulty"], string> = {
  EASY: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  MEDIUM: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  HARD: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

export const typeLabel: Record<Question["type"], string> = { MCQ: "MCQ", THEORY: "Theory", STRUCTURED: "Structured" };

export function difficultyLabel(d: Question["difficulty"]): string {
  return d[0] + d.slice(1).toLowerCase();
}
