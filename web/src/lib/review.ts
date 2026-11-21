/**
 * Shared types and helpers for reviewing questions.
 * Edits, verify, delete and publish are saved in the database through the API (see lib/api.ts).
 */
import { api, fileUrl, type Question, type QuestionPatch } from "@/lib/api";

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** An image is either a cropped file on the server, or (path = null) a box cropped from the page image on the fly. */
export interface DisplayImage {
  path: string | null;
  page: number;
  box: Box;
}

/** A question as the editor sees it (the API already includes status + edited). */
export type ReviewedQuestion = Question;

export type QuestionEdit = Omit<QuestionPatch, "verify">;

export function pageImageUrl(paperId: string, page: number, kind: "qp" | "ms" = "qp"): string {
  return fileUrl(`papers/${paperId}/pages/${kind}-p${page}.png`);
}

/**
 * Ask the AI (the one chosen in Settings) to read one question again, guided by the admin's hint: its page(s) and,
 * when known, its mark-scheme page. Returns the new fields only; nothing is saved until the admin clicks Save.
 */
export function regenerateQuestion(paperId: string, questionId: string, hint: string): Promise<QuestionEdit> {
  return api.regenerateQuestion(paperId, questionId, hint.trim());
}
