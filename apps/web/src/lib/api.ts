// Types mirror apps/api/src/papers/paper.types.ts and catalog.ts

/** Empty = same address as the website (/api, /files go through port 3000 to the API). Set only if the API lives elsewhere. */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export interface PaperMeta {
  id: string;
  board: string;
  curriculum: string;
  subjectCode: string;
  subjectName: string;
  year: number;
  seasonCode: string;
  seasonName: string;
  paperCode: string;
  paperNumber: number | null;
  variant: number | null;
  componentName: string | null;
  qpFileName: string;
  msFileName: string | null;
  paperState: "UPLOADED" | "PROCESSING" | "IN_REVIEW" | "PUBLISHED" | "FAILED" | "ARCHIVED";
  publishedAt: string | null;
  createdAt: string;
}

export type ProcessingState = "QUEUED" | "RENDERING" | "EXTRACTING" | "MARK_SCHEME" | "DONE" | "FAILED";

export interface PaperStatus {
  state: ProcessingState;
  progress: number;
  message: string;
  pagesTotal: number;
  pagesDone: number;
  questionsFound: number;
  error: string | null;
  updatedAt: string;
}

export interface Question {
  id: string;
  number: string;
  type: "MCQ" | "THEORY" | "STRUCTURED";
  marks: number | null;
  text: string;
  options: { label: string; text: string }[];
  topicCode: string | null;
  topic: string;
  subtopic: string;
  /** Syllabus subtopic code (e.g. "2.3"), null for a free-text subtopic. */
  subtopicCode?: string | null;
  /** Finer AI wording of the subtopic, used by search. */
  subtopicDetail?: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  keywords: string[];
  page: number;
  pages: number[];
  /** path = cropped image file; null = crop the page image on the fly. */
  images: { path: string | null; page: number; box: { x0: number; y0: number; x1: number; y1: number } }[];
  answer: { correctOption: string | null; text: string } | null;
  confidence: number;
  status: "DRAFT" | "VERIFIED" | "PUBLISHED";
  /** Changed by an admin after the AI extraction. */
  edited: boolean;
  /** Similar questions from other papers (ids, best first), pre-computed with vectors. */
  similarIds: string[];
}

/** Fields the editor sends; only what is present is changed. */
export interface QuestionPatch {
  type?: Question["type"];
  marks?: number | null;
  text?: string;
  options?: { label: string; text: string }[];
  topicCode?: string | null;
  topic?: string;
  subtopic?: string;
  difficulty?: Question["difficulty"];
  keywords?: string[];
  answer?: { correctOption: string | null; text: string } | null;
  images?: { page: number; box: { x0: number; y0: number; x1: number; y1: number } }[];
  verify?: boolean;
}

export interface PaperListItem {
  meta: PaperMeta;
  status: PaperStatus | null;
  counts: { total: number; verified: number };
}

export interface BankItem {
  meta: PaperMeta;
  question: Question;
  order: number;
}

export interface Extraction {
  paperId: string;
  provider: string;
  model: string;
  generatedAt: string;
  questions: Question[];
}

export interface PaperDetail {
  meta: PaperMeta;
  status: PaperStatus | null;
  extraction: Extraction | null;
}

export interface Subject {
  code: string;
  name: string;
  board: string;
  curriculum: string;
  components: { number: number; name: string; style: string }[];
  topics: { code: string; name: string }[];
}

export interface Catalog {
  seasons: { code: string; name: string }[];
  subjects: Subject[];
}

export interface ParsedFilename {
  subjectCode: string;
  subjectName: string | null;
  seasonCode: string;
  seasonName: string;
  year: number;
  kind: "qp" | "ms";
  paperCode: string;
  paperNumber: number;
  variant: number | null;
  componentName: string | null;
}

/** Paper details filled automatically (file name or AI reading the cover page). Mirrors apps/api paper-details.ts */
export interface DetectedDetails {
  source: "filename" | "ai";
  documentType: "QUESTION_PAPER" | "MARK_SCHEME" | "OTHER";
  board: string | null;
  curriculum: string | null;
  subjectCode: string | null;
  subjectName: string | null;
  year: number | null;
  seasonCode: string | null;
  paperCode: string | null;
  componentName: string | null;
  confidence: number;
  missing: string[];
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "pa.adminToken";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

const tokenListeners = new Set<() => void>();

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private mode: admin session just won't persist
  }
  tokenListeners.forEach((l) => l());
}

/** Notifies on login/logout in this tab and in other tabs. */
export function subscribeToken(listener: () => void): () => void {
  tokenListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    tokenListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Cannot reach the API server. Is it running?", 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new ApiError(message || `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (password: string) => request<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  catalog: () => request<Catalog>("/catalog"),
  parseFilename: (name: string) => request<{ parsed: ParsedFilename | null }>(`/catalog/parse-filename?name=${encodeURIComponent(name)}`),
  papers: () => request<PaperListItem[]>("/papers"),
  paper: (id: string) => request<PaperDetail>(`/papers/${encodeURIComponent(id)}`),
  detect: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<DetectedDetails>("/papers/detect", { method: "POST", body: form });
  },
  upload: (form: FormData) => request<{ id: string }>("/papers", { method: "POST", body: form }),
  reprocess: (id: string) => request<{ id: string }>(`/papers/${encodeURIComponent(id)}/reprocess`, { method: "POST" }),
  remove: (id: string) => request<void>(`/papers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  publish: (id: string) => request<{ id: string }>(`/papers/${encodeURIComponent(id)}/publish`, { method: "POST" }),
  verifyAll: (id: string) => request<{ id: string; verified: number }>(`/papers/${encodeURIComponent(id)}/verify-all`, { method: "POST" }),
  unpublish: (id: string) => request<{ id: string }>(`/papers/${encodeURIComponent(id)}/unpublish`, { method: "POST" }),
  updateQuestion: (paperId: string, questionId: string, patch: QuestionPatch) =>
    request<Question>(`/papers/${encodeURIComponent(paperId)}/questions/${questionId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  verifyQuestion: (paperId: string, questionId: string, verified: boolean) =>
    request<Question>(`/papers/${encodeURIComponent(paperId)}/questions/${questionId}/verify`, { method: "POST", body: JSON.stringify({ verified }) }),
  deleteQuestion: (paperId: string, questionId: string) =>
    request<void>(`/papers/${encodeURIComponent(paperId)}/questions/${questionId}`, { method: "DELETE" }),
  restoreQuestion: (paperId: string, questionId: string) =>
    request<void>(`/papers/${encodeURIComponent(paperId)}/questions/${questionId}/restore`, { method: "POST" }),
  /** Published questions for students (no login). */
  // Server-side bank: the browser only ever gets one page (filters / counts / search run on the server)
  bankGet: <T,>(path: string, params: URLSearchParams) => request<T>(`/bank/${path}?${params}`),
  bankEntries: (ids: string[]) => request<BankItem[]>("/bank/entries", { method: "POST", body: JSON.stringify({ ids }) }),
  bankPaper: (paper: string) => request<BankItem[]>(`/bank/entries?paper=${encodeURIComponent(paper)}`),
};

export function fileUrl(path: string): string {
  return `${API_URL}/files/${path}`;
}

/** "Physics · May/June 2026 · Paper 11 · Q1" */
export function sourceLine(meta: PaperMeta, questionNumber?: string): string {
  const parts = [meta.subjectName, `${meta.seasonName} ${meta.year}`, `Paper ${meta.paperCode}`];
  if (questionNumber) parts.push(`Q${questionNumber}`);
  return parts.join(" · ");
}

export function isProcessing(status: PaperStatus | null): boolean {
  return !!status && status.state !== "DONE" && status.state !== "FAILED";
}

// ---------------------------------------------------------------- PDF downloads

/** none = questions only · end = answers on their own pages at the end · inline = answer under each question */
export type AnswerMode = "none" | "end" | "inline";

/** Selected questions (ids, in order) or a whole published paper. */
export interface PdfRequest {
  ids?: string[];
  paper?: string;
  answers: AnswerMode;
  title?: string;
}

export function pdfParams(r: PdfRequest): URLSearchParams {
  const p = new URLSearchParams();
  if (r.paper) p.set("paper", r.paper);
  if (r.ids?.length) p.set("ids", r.ids.join(","));
  p.set("answers", r.answers);
  if (r.title?.trim()) p.set("title", r.title.trim());
  return p;
}

/** The server renders the print page in Chrome and returns a PDF file. */
export async function downloadPdf(r: PdfRequest, fileName: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/bank/pdf?${pdfParams(r)}`);
  } catch {
    throw new ApiError("Cannot reach the API server. Is it running?", 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.message || `PDF failed (${res.status})`, res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** The uploaded original question paper / mark scheme. */
export function originalPdfUrl(paperId: string, kind: "qp" | "ms"): string {
  return fileUrl(`papers/${paperId}/${kind}.pdf`);
}
