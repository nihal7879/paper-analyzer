/**
 * Shared types and helpers for reviewing questions.
 * Edits, verify, delete and publish are saved in the database through the API (see lib/api.ts).
 */
import { fileUrl, type Question, type QuestionPatch } from "@/lib/api";

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

export function pageImageUrl(paperId: string, page: number): string {
  return fileUrl(`papers/${paperId}/pages/qp-p${page}.png`);
}

/**
 * Ask the AI to read one question again, guided by the admin's hint.
 * The backend endpoint for this is not built yet.
 */
export async function regenerateQuestion(paperId: string, questionId: string, hint: string): Promise<QuestionEdit> {
  void paperId;
  void questionId;
  void hint;
  await new Promise((r) => setTimeout(r, 400));
  throw new Error("AI regenerate for a single question is not available yet. Edit the fields, or re-process the paper.");
}
