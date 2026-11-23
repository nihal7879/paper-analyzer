// Types mirror api/src/papers/paper.types.ts and catalog.ts

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
  /** The whole question part cut from the paper (one per page), for worksheets that look like the real paper. */
  crops?: { path: string | null; page: number; box: { x0: number; y0: number; x1: number; y1: number; edge?: { l: number; r: number }; space?: { lines?: number; pitch?: number; blank?: number }; rules?: { from: number; pitch: number }; cont?: { x: number; base: number; em: number; w?: number; cover?: boolean }; qmark?: { x: number; base: number; em: number }; num?: { x: number; y: number; h: number; w?: number; cover?: boolean; t?: string; more?: { x: number; y: number; h: number; t: string }[] } } }[];
  /** The part's rows cut from the mark scheme (head = the table's grey header row, on the first crop). */
  /** pw / ph: the mark-scheme page size in mm (landscape A4 when missing). */
  msCrops?: { path: string | null; page: number; box: { x0: number; y0: number; x1: number; y1: number; pw?: number; ph?: number; head?: string; labels?: { x: number; base: number; t: string; q: boolean }[]; num?: { x: number; y: number; h: number; t?: string; more?: { x: number; y: number; h: number; t: string }[] } } }[];
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
  /** part number as printed, e.g. "14(a)" */
  number?: string;
  /** question-paper pages the part is on */
  pages?: number[];
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

/** Paper details filled automatically (file name or AI reading the cover page). Mirrors api paper-details.ts */
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

/** A backup of a paper (automatic before risky actions) or of one question. */
export interface PaperVersion {
  id: number;
  kind: "SNAPSHOT" | "DRAFT";
  questionId: number | null;
  label: string;
  parts: number;
  applied: boolean;
  createdAt: string;
}
/** A problem found in a paper's parts (errors block publishing). */
export interface PaperIssue {
  severity: "error" | "warning";
  code: string;
  questionId: string | null;
  number: string | null;
  message: string;
}
interface DraftSide {
  number: string;
  text: string;
  marks: number | null;
  type: string;
  pages: number[];
  answer: string;
  options: number;
}
/** An AI re-read waiting to be compared with the live paper. */
export interface PaperDraft {
  id: number;
  label: string;
  createdAt: string;
  rows: { key: string; current: (DraftSide & { id: string }) | null; draft: (DraftSide & { images: number }) | null; same: boolean }[];
}

export type AiProviderId = "claude" | "openai" | "gemini";
export interface AiProviderUsage {
  requests: number;
  failures: number;
  lastUsedAt: string | null;
  lastError: string | null;
}
/** Admin AI settings: the AI in use, and each provider's key (masked), model and request counts. */
export interface AiSettings {
  active: AiProviderId | "mock";
  inUse: { name: string; model: string };
  providers: { id: AiProviderId; label: string; keySet: boolean; keyMasked: string | null; model: string; usage: AiProviderUsage }[];
}

export const api = {
  aiSettings: () => request<AiSettings>("/settings/ai"),
  updateAiSettings: (body: { provider?: AiProviderId | "mock"; keys?: Partial<Record<AiProviderId, string>>; models?: Partial<Record<AiProviderId, string>> }) =>
    request<AiSettings>("/settings/ai", { method: "PUT", body: JSON.stringify(body) }),
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
  reprocess: (id: string) => request<{ id: string; draft?: boolean }>(`/papers/${encodeURIComponent(id)}/reprocess`, { method: "POST" }),
  remove: (id: string) => request<void>(`/papers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  publish: (id: string) => request<{ id: string }>(`/papers/${encodeURIComponent(id)}/publish`, { method: "POST" }),
  verifyAll: (id: string) => request<{ id: string; verified: number }>(`/papers/${encodeURIComponent(id)}/verify-all`, { method: "POST" }),
  unpublish: (id: string) => request<{ id: string }>(`/papers/${encodeURIComponent(id)}/unpublish`, { method: "POST" }),
  updateQuestion: (paperId: string, questionId: string, patch: QuestionPatch) =>
    request<Question>(`/papers/${encodeURIComponent(paperId)}/questions/${questionId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  /** Save a part's hand-drawn worksheet crop (question paper or mark scheme). */
  /** Add an empty part right after another one (split a part the AI merged). */
  // ---- safety tools: backups, checks, AI draft, part tools, cost estimate
  versions: (paperId: string) => request<PaperVersion[]>(`/papers/${encodeURIComponent(paperId)}/versions`),
  versionParts: (paperId: string, versionId: number) => request<{ id: number; number: string; deleted: boolean }[]>(`/papers/${encodeURIComponent(paperId)}/versions/${versionId}/parts`),
  backupNow: (paperId: string, label?: string) => request<{ id: number | null }>(`/papers/${encodeURIComponent(paperId)}/versions`, { method: "POST", body: JSON.stringify({ label }) }),
  restoreVersion: (paperId: string, versionId: number, questionId?: number) =>
    request<{ restored: number }>(`/papers/${encodeURIComponent(paperId)}/versions/${versionId}/restore`, { method: "POST", body: JSON.stringify(questionId ? { questionId } : {}) }),
  checks: (paperId: string) => request<PaperIssue[]>(`/papers/${encodeURIComponent(paperId)}/checks`),
  draft: (paperId: string) => request<PaperDraft | null>(`/papers/${encodeURIComponent(paperId)}/draft`),
  applyDraft: (paperId: string, draftId: number, take: string[]) =>
    request<{ taken: number }>(`/papers/${encodeURIComponent(paperId)}/draft/${draftId}/apply`, { method: "POST", body: JSON.stringify({ take }) }),
  discardDraft: (paperId: string, draftId: number) => request<{ discarded: boolean }>(`/papers/${encodeURIComponent(paperId)}/draft/${draftId}`, { method: "DELETE" }),
  reprocessEstimate: (paperId: string) =>
    request<{ provider: string; model: string; pages: number; usdLow: number; usdHigh: number }>(`/papers/${encodeURIComponent(paperId)}/reprocess-estimate`),
  mergeNext: (paperId: string, questionId: string) => request<Question>(`/papers/${encodeURIComponent(paperId)}/questions/${questionId}/merge-next`, { method: "POST" }),
  splitPart: (paperId: string, questionId: string, body: { at: number; number: string; firstPages: number[]; secondPages: number[]; secondMarks: number | null }) =>
    request<Question>(`/papers/${encodeURIComponent(paperId)}/questions/${questionId}/split`, { method: "POST", body: JSON.stringify(body) }),
  movePart: (paperId: string, questionId: string, direction: "up" | "down") =>
    request<{ moved: boolean }>(`/papers/${encodeURIComponent(paperId)}/questions/${questionId}/move`, { method: "POST", body: JSON.stringify({ direction }) }),
  testAiKey: (provider: AiProviderId) => request<{ ok: boolean; message: string }>("/settings/ai/test", { method: "POST", body: JSON.stringify({ provider }) }),
  addPart: (paperId: string, afterQuestionId: string, body: { number: string; pages: number[] }) =>
    request<Question>(`/papers/${encodeURIComponent(paperId)}/questions/${afterQuestionId}/add-part`, { method: "POST", body: JSON.stringify(body) }),
  /** Read one question again with AI (its page + mark-scheme page), guided by a note; returns new fields, saves nothing. */
  regenerateQuestion: (paperId: string, questionId: string, hint: string) =>
    request<Omit<QuestionPatch, "verify">>(`/papers/${encodeURIComponent(paperId)}/questions/${questionId}/regenerate`, { method: "POST", body: JSON.stringify({ hint }) }),
  setCrops: (paperId: string, questionId: string, body: { source: "QP" | "MS"; regions: { page: number; box: { x0: number; y0: number; x1: number; y1: number } }[] }) =>
    request<Question>(`/papers/${encodeURIComponent(paperId)}/questions/${questionId}/crops`, { method: "PUT", body: JSON.stringify(body) }),
  /** Re-cut a paper's worksheet crops (question paper + mark scheme) from the original PDFs. */
  rebuildCrops: (paperId: string) =>
    request<{ parts: number; qp: number; ms: number; notFound: string[] }>(`/papers/${encodeURIComponent(paperId)}/crops`, { method: "POST" }),
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

/**
 * A paper named the way the exam board prints it (mirrors api/src/papers/paper-label.ts):
 * head "Paper 1" / "Unit 1" / "Mechanics 1", title "Core Physics I", code "7408/1" / "8PH0/01" / "WPH11" / "WME01".
 */
export function paperParts(meta: Pick<PaperMeta, "subjectCode" | "paperCode" | "componentName">): { head: string; title: string | null; code: string } {
  const name = (meta.componentName ?? "").trim();
  const bracket = /\(([^()]+)\)\s*$/.exec(name);
  const code = bracket ? bracket[1].trim() : `${meta.subjectCode}/${meta.paperCode}`;
  const bare = bracket ? name.slice(0, bracket.index).trim() : name;
  if (!bare) return { head: `Paper ${meta.paperCode}`, title: null, code };
  const colon = bare.indexOf(": ");
  if (colon > 0) return { head: bare.slice(0, colon), title: bare.slice(colon + 2), code };
  if (/^(paper|unit|module)\b/i.test(bare) || !/^\d+$/.test(meta.paperCode)) return { head: bare, title: null, code };
  return { head: `Paper ${Number(meta.paperCode)}`, title: bare, code };
}

/** "Unit 1 (WPH11)" */
export function paperShort(meta: Pick<PaperMeta, "subjectCode" | "paperCode" | "componentName">): string {
  const p = paperParts(meta);
  return `${p.head} (${p.code})`;
}

/** "Physics · May/June 2026 · Unit 1 (WPH11) · Q1" */
// The board goes in front of the source only while the shown questions mix boards (set by the question list).
let boardInSource = false;
export function setBoardInSource(on: boolean) {
  boardInSource = on;
}

/** "Physics · May/June 2026 · Unit 1 (WPH11) · Q1"; "Edexcel · Physics · …" while several boards are shown. */
export function sourceLine(meta: PaperMeta, questionNumber?: string): string {
  const parts = [...(boardInSource ? [meta.board] : []), meta.subjectName, `${meta.seasonName} ${meta.year}`, paperShort(meta)];
  if (questionNumber) parts.push(`Q${questionNumber}`);
  return parts.join(" · ");
}

export function isProcessing(status: PaperStatus | null): boolean {
  return !!status && status.state !== "DONE" && status.state !== "FAILED";
}

// ---------------------------------------------------------------- PDF downloads

/** none = questions only · end = answers on their own pages at the end · inline = answer under each question */
export type AnswerMode = "none" | "end" | "inline" | "only";

/** Selected questions (ids, in order) or a whole published paper. */
export interface PdfRequest {
  ids?: string[];
  paper?: string;
  answers: AnswerMode;
  title?: string;
  /** "paper" = past-paper style (original crops, border, strip); default = the normal typed layout */
  style?: "normal" | "paper";
}

export function pdfParams(r: PdfRequest): URLSearchParams {
  const p = new URLSearchParams();
  if (r.paper) p.set("paper", r.paper);
  if (r.ids?.length) p.set("ids", r.ids.join(","));
  p.set("answers", r.answers);
  if (r.title?.trim()) p.set("title", r.title.trim());
  if (r.style === "paper") p.set("style", "paper");
  return p;
}

/** A PDF the server could not make; `job` (when the job was started) lets the print page load the same selection. */
export class PdfError extends ApiError {
  readonly job: string | null;

  constructor(message: string, status: number, job: string | null) {
    super(message, status);
    this.job = job;
  }
}

/** The browser's own print page for a PDF request (backup when the server can not make it). */
export function printPageUrl(r: PdfRequest, job: string | null): string {
  const p = pdfParams(r);
  // a big selection's ids would make a web address too long for the server: the print page reads them from the job
  if (job && r.ids?.length) {
    p.delete("ids");
    p.set("job", job);
  }
  return `/print?${p}&print=1`;
}

const PDF_POLL_MS = 2500;

/**
 * The server makes the PDF in the background (a big selection takes minutes, longer than a web proxy waits for one
 * request): start a job, ask for its progress every few seconds (onProgress gets the server's message and 0-100),
 * then download the file with a plain link, so it goes straight to disk. The ids go in the body, so any size works.
 */
export async function downloadPdf(r: PdfRequest, fileName: string, onProgress?: (message: string, percent: number) => void): Promise<void> {
  const call = async (path: string, init?: RequestInit) => {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api${path}`, init);
    } catch {
      return { ok: false, status: 0, body: { message: "Cannot reach the API server. Is it running?" } };
    }
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
  };
  const start = await call("/bank/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...r, fileName: fileName.replace(/\.pdf$/i, "") }),
  });
  if (!start.ok || !start.body?.job) throw new PdfError(start.body?.message || `PDF failed (${start.status})`, start.status, null);
  const job: string = start.body.job;
  let misses = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, PDF_POLL_MS));
    const s = await call(`/bank/pdf/job/${encodeURIComponent(job)}`);
    if (!s.ok) {
      // a short network blip: keep asking for a while before giving up
      if (s.status === 0 && ++misses < 8) continue;
      throw new PdfError(s.body?.message || `PDF failed (${s.status})`, s.status, job);
    }
    misses = 0;
    onProgress?.(s.body.message, s.body.percent ?? 0);
    if (s.body.status === "failed") throw new PdfError(s.body.message || "Could not create the PDF", 500, job);
    if (s.body.status === "done" && s.body.token) {
      const a = document.createElement("a");
      a.href = `${API_URL}/api/bank/pdf/file/${encodeURIComponent(s.body.token)}`;
      document.body.append(a);
      a.click();
      a.remove();
      return;
    }
  }
}

/** The uploaded original question paper / mark scheme. */
export function originalPdfUrl(paperId: string, kind: "qp" | "ms"): string {
  return fileUrl(`papers/${paperId}/${kind}.pdf`);
}
