import { ArrowLeft, ArrowRight, CheckCircle2, Eye, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { KeywordInput } from "@/components/keyword-input";
import { MathText } from "@/components/math-text";
import { PageCropper, type CropRegion } from "@/components/page-cropper";
import { QuestionCard, type CardQuestion } from "@/components/question-card";
import { difficultyStyle } from "@/lib/format";
import { Segmented } from "@/components/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { PaperMeta, Question } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { regenerateQuestion, type QuestionEdit, type ReviewedQuestion } from "@/lib/review";
import { cn } from "@/lib/utils";

interface FormState {
  type: Question["type"];
  marks: string;
  difficulty: Question["difficulty"];
  topicCode: string | null;
  topic: string;
  subtopic: string;
  keywords: string[];
  text: string;
  options: { label: string; text: string }[];
  correctOption: string | null;
  answerText: string;
  regions: CropRegion[];
}

const OTHER_TOPIC = "__other__";

function toForm(q: ReviewedQuestion): FormState {
  return {
    type: q.type,
    marks: q.marks == null ? "" : String(q.marks),
    difficulty: q.difficulty,
    topicCode: q.topicCode,
    topic: q.topic,
    subtopic: q.subtopic,
    keywords: q.keywords,
    text: q.text,
    options: q.options,
    correctOption: q.answer?.correctOption ?? null,
    answerText: q.answer?.text ?? "",
    regions: q.images.map((i) => ({ page: i.page, box: i.box })),
  };
}

function toEdit(f: FormState, original: ReviewedQuestion): QuestionEdit {
  const isMcq = f.type === "MCQ";
  const edit: QuestionEdit = {
    type: f.type,
    marks: f.marks === "" ? null : Number(f.marks),
    difficulty: f.difficulty,
    topicCode: f.topicCode,
    topic: f.topic.trim(),
    subtopic: f.subtopic.trim(),
    keywords: f.keywords,
    text: f.text,
    options: isMcq ? f.options.filter((o) => o.text.trim()) : [],
    answer:
      (isMcq && f.correctOption) || f.answerText.trim()
        ? { correctOption: isMcq ? f.correctOption : null, text: isMcq && !f.answerText.trim() ? (f.correctOption ?? "") : f.answerText }
        : null,
  };
  // Only store new boxes when they changed, so untouched questions keep the server-cropped files.
  if (JSON.stringify(f.regions) !== JSON.stringify(original.images.map((i) => ({ page: i.page, box: i.box })))) edit.images = f.regions;
  return edit;
}

export function QuestionEditor({
  paperId,
  meta,
  question,
  topics,
  position,
  onPrev,
  onNext,
}: {
  paperId: string;
  meta: PaperMeta;
  question: ReviewedQuestion;
  topics: { code: string; name: string }[];
  position: { index: number; total: number };
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const [baseline, setBaseline] = useState<FormState>(() => toForm(question));
  const [form, setForm] = useState<FormState>(baseline);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [regenOpen, setRegenOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const verified = question.status !== "DRAFT";

  /** Reload this paper (and lists) after a change saved on the server. */
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["paper", paperId] }),
      queryClient.invalidateQueries({ queryKey: ["papers"] }),
      queryClient.invalidateQueries({ queryKey: ["bank"] }),
    ]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
      await refresh();
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save(verify: boolean) {
    if (busy) return;
    if (form.marks !== "" && !(Number(form.marks) >= 0)) {
      toast.error("Marks must be a number");
      return;
    }
    if (!form.text.trim()) {
      toast.error("Question text can't be empty");
      return;
    }
    if (!dirty && !verify) return;
    // Only send content when something changed, so verifying alone doesn't mark the question as edited.
    const patch = dirty ? { ...toEdit(form, question), verify } : { verify };
    const ok = await run(() => api.updateQuestion(paperId, question.id, patch), verify ? `Question ${question.number} verified` : "Changes saved");
    if (!ok) return;
    setBaseline(form);
    if (verify) onNext?.();
  }

  // Ctrl/Cmd+S = save, Ctrl/Cmd+Enter = save & verify
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "s") {
        e.preventDefault();
        void saveRef.current(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void saveRef.current(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function remove() {
    const ok = await run(() => api.deleteQuestion(paperId, question.id));
    if (!ok) return;
    toast(`Question ${question.number} removed`, {
      action: { label: "Undo", onClick: () => void run(() => api.restoreQuestion(paperId, question.id), "Question restored") },
    });
    onNext?.();
  }

  const previewQuestion: CardQuestion = {
    ...question,
    ...toEdit(form, question),
    images: form.regions.map((r) => {
      const same = question.images.find((i) => i.page === r.page && JSON.stringify(i.box) === JSON.stringify(r.box));
      return same ?? { path: null, page: r.page, box: r.box };
    }),
  } as CardQuestion;

  const pages = [...new Set([...question.pages, Math.max(1, question.page - 1), question.pages[question.pages.length - 1] + 1])].sort((a, b) => a - b);
  const topicItems = [...topics.map((t) => ({ value: t.code, label: `${t.code}. ${t.name}` })), { value: OTHER_TOPIC, label: "Other (type below)" }];
  const nextLabel = String.fromCharCode(65 + form.options.length);

  return (
    <Card className="gap-0 overflow-hidden p-0 animate-in duration-200 fade-in-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-semibold">Question {question.number}</h2>
          {verified ? (
            <Badge className="gap-1 border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3" /> Verified
            </Badge>
          ) : (
            <Badge variant="outline">To review</Badge>
          )}
          {question.edited && <Badge variant="secondary">Edited</Badge>}
          {dirty && <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">Unsaved</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground tabular-nums">
            {position.index + 1} / {position.total}
          </span>
          <Button size="icon-sm" variant="outline" aria-label="Previous question" disabled={!onPrev} onClick={() => onPrev?.()}>
            <ArrowLeft />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Next question" disabled={!onNext} onClick={() => onNext?.()}>
            <ArrowRight />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "edit" | "preview")} className="gap-0">
        <div className="border-b px-4 py-2 sm:px-5">
          <TabsList>
            <TabsTrigger value="edit" className="gap-1.5 px-3">
              <Pencil className="size-3.5" /> Edit
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1.5 px-3">
              <Eye className="size-3.5" /> Student view
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="edit" className="grid gap-6 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Original page + crops */}
          <section className="grid content-start gap-2">
            <SectionTitle>Original page &amp; figures</SectionTitle>
            <PageCropper paperId={paperId} pages={pages} initialPage={question.page} regions={form.regions} onChange={(r) => set("regions", r)} />
          </section>

          {/* Fields */}
          <section className="grid content-start gap-5">
            <SectionTitle>Details</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="Type">
                <Segmented
                  aria-label="Question type"
                  value={form.type}
                  onChange={(v) => set("type", v)}
                  options={[
                    { value: "MCQ", label: "MCQ" },
                    { value: "STRUCTURED", label: "Structured" },
                    { value: "THEORY", label: "Theory" },
                  ]}
                />
              </Field>
              <Field label="Marks" htmlFor="marks">
                <Input id="marks" inputMode="numeric" className="h-9 w-full sm:w-24" value={form.marks} onChange={(e) => set("marks", e.target.value.replace(/[^\d]/g, ""))} />
              </Field>
            </div>
            <Field label="Difficulty">
              <Segmented
                aria-label="Difficulty"
                value={form.difficulty}
                onChange={(v) => set("difficulty", v)}
                options={(["EASY", "MEDIUM", "HARD"] as const).map((d) => ({ value: d, label: d[0] + d.slice(1).toLowerCase(), activeClassName: difficultyStyle[d] }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Topic">
                {topics.length ? (
                  <Select
                    items={topicItems}
                    value={form.topicCode ?? OTHER_TOPIC}
                    onValueChange={(v) => {
                      const t = topics.find((x) => x.code === v);
                      setForm((f) => ({ ...f, topicCode: t ? t.code : null, topic: t ? t.name : f.topic }));
                    }}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {topicItems.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input className="h-9" value={form.topic} onChange={(e) => set("topic", e.target.value)} />
                )}
                {topics.length > 0 && form.topicCode == null && (
                  <Input className="mt-2 h-9" placeholder="Topic name" value={form.topic} onChange={(e) => set("topic", e.target.value)} />
                )}
              </Field>
              <Field label="Subtopic" htmlFor="subtopic">
                <Input id="subtopic" className="h-9" value={form.subtopic} onChange={(e) => set("subtopic", e.target.value)} placeholder="e.g. Momentum and impulse" />
              </Field>
            </div>
            <Field label="Keywords" htmlFor="keywords" hint="Used for search and similar questions">
              <KeywordInput id="keywords" value={form.keywords} onChange={(k) => set("keywords", k)} />
            </Field>

            <LatexField label="Question text" value={form.text} onChange={(v) => set("text", v)} rows={6} />

            {form.type === "MCQ" && (
              <Field label="Options">
                <div className="grid gap-2">
                  {form.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        type="button"
                        title="Mark as correct answer"
                        onClick={() => set("correctOption", opt.label)}
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                          form.correctOption === opt.label ? "border-emerald-600 bg-emerald-600 text-white" : "hover:bg-muted",
                        )}
                      >
                        {opt.label}
                      </button>
                      <Input
                        className="h-9 font-mono text-[13px]"
                        value={opt.text}
                        onChange={(e) => set("options", form.options.map((o, j) => (j === i ? { ...o, text: e.target.value } : o)))}
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove option ${opt.label}`}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            options: f.options.filter((_, j) => j !== i).map((o, j) => ({ ...o, label: String.fromCharCode(65 + j) })),
                            correctOption: f.correctOption === opt.label ? null : f.correctOption,
                          }))
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  {form.options.length < 6 && (
                    <Button variant="outline" size="sm" className="w-fit gap-1" onClick={() => set("options", [...form.options, { label: nextLabel, text: "" }])}>
                      <Plus className="size-3.5" /> Add option {nextLabel}
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {form.correctOption ? (
                      <>
                        Correct answer: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{form.correctOption}</span> (click a letter to change)
                      </>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Click a letter to mark the correct answer.</span>
                    )}
                  </p>
                </div>
              </Field>
            )}

            <LatexField
              label={form.type === "MCQ" ? "Explanation (optional)" : "Answer / mark scheme"}
              value={form.answerText === form.correctOption ? "" : form.answerText}
              onChange={(v) => set("answerText", v)}
              rows={4}
              placeholder={form.type === "MCQ" ? "Optional working shown after the correct letter" : "Marking points, one per line, e.g. Δp = m(v − u) **C1**"}
            />
          </section>
        </TabsContent>

        <TabsContent value="preview" className="bg-muted/30 p-4 sm:p-6">
          <div className="mx-auto max-w-3xl">
            <QuestionCard question={previewQuestion} meta={meta} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Action bar */}
      <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex gap-1.5">
          <Button variant="outline" className="gap-1.5" onClick={() => setRegenOpen(true)}>
            <Sparkles className="size-4" /> Regenerate with AI
          </Button>
          <Button variant="ghost" size="icon" aria-label="Remove question" className="text-destructive" disabled={busy} onClick={() => void remove()}>
            <Trash2 className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {dirty && (
            <Button variant="ghost" className="gap-1.5" onClick={() => setForm(baseline)}>
              <Undo2 className="size-4" /> Discard
            </Button>
          )}
          {verified && !dirty && (
            <Button variant="ghost" className="gap-1.5" disabled={busy} onClick={() => void run(() => api.verifyQuestion(paperId, question.id, false), "Marked to review")}>
              <RotateCcw className="size-4" /> Mark to review
            </Button>
          )}
          <Button variant="outline" className="gap-1.5" disabled={!dirty || busy} onClick={() => void save(false)} title="Ctrl+S">
            <Save className="size-4" /> Save
          </Button>
          <Button className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90" disabled={busy} onClick={() => void save(true)} title="Ctrl+Enter">
            <CheckCircle2 className="size-4" /> {verified && !dirty ? "Verified · next" : "Save & verify"}
          </Button>
        </div>
      </div>

      <RegenerateDialog open={regenOpen} onOpenChange={setRegenOpen} paperId={paperId} question={question} onResult={(edit) => setForm((f) => ({ ...f, ...toForm({ ...question, ...edit } as ReviewedQuestion) }))} />
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>;
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Raw Markdown/LaTeX on top, rendered preview underneath. */
function LatexField({ label, value, onChange, rows, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows: number; placeholder?: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-[11px] text-muted-foreground">
          LaTeX: <code className="rounded bg-muted px-1">$v = u + at$</code>
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="min-h-0 resize-y rounded-none border-0 font-mono text-[13px] shadow-none focus-visible:ring-0"
        />
        <div className="border-t bg-muted/30 px-3 py-2.5">
          {value.trim() ? <MathText className="text-sm">{value}</MathText> : <p className="text-xs text-muted-foreground italic">Preview appears here</p>}
        </div>
      </div>
    </div>
  );
}

function RegenerateDialog({
  open,
  onOpenChange,
  paperId,
  question,
  onResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paperId: string;
  question: ReviewedQuestion;
  onResult: (edit: QuestionEdit) => void;
}) {
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const suggestions = ["Text is incomplete", "Marks should be different", "Diagram is missing", "Equation is wrong", "Wrong topic"];

  async function run() {
    setBusy(true);
    try {
      const edit = await regenerateQuestion(paperId, question.id, hint);
      onResult(edit);
      toast.success("New version loaded. Check it, then save.");
      onOpenChange(false);
    } catch (err) {
      toast.info((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <DialogTitle>Regenerate question {question.number}</DialogTitle>
          <DialogDescription>The AI reads page {question.pages.join(", ")} again. Tell it what went wrong. The result fills the form; nothing is saved until you click Save.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="hint">What should the AI fix? (optional)</Label>
          <Textarea id="hint" rows={3} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. Part (b) continues on the next page, marks should be 4" />
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setHint((h) => (h ? `${h}. ${s}` : s))}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-1.5" disabled={busy} onClick={run}>
            <Sparkles className="size-4" /> {busy ? "Reading page…" : "Regenerate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}












































