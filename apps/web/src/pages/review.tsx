import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Crop,
  FileText,
  Globe,
  GlobeLock,
  History,
  Image as ImageIcon,
  ImageOff,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProcessingCard } from "@/components/processing-card";
import { typeLabel } from "@/lib/format";
import { QuestionEditor } from "@/components/question-editor";
import { AdminPageBar } from "@/components/admin-menu";
import { RequireAdmin } from "@/components/require-admin";
import {
  ChecksCard,
  DraftBanner,
  HistoryDialog,
} from "@/components/review-tools";
import { Segmented } from "@/components/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api, isProcessing, sourceLine } from "@/lib/api";
import type { ReviewedQuestion } from "@/lib/review";
import { cn } from "@/lib/utils";

type ListFilter = "all" | "todo" | "done";

export function ReviewPage() {
  return (
    <RequireAdmin>
      <Review />
    </RequireAdmin>
  );
}

function Review() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [confirm, setConfirm] = useState<
    | null
    | "reprocess"
    | "delete"
    | "unpublish"
    | "verifyAll"
    | "recrop"
    | "publishMissing"
  >(null);

  const paper = useQuery({
    queryKey: ["paper", id],
    queryFn: () => api.paper(id),
    refetchInterval: (query) =>
      isProcessing(query.state.data?.status ?? null) ? 1500 : false,
  });
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: api.catalog,
    staleTime: Infinity,
  });
  // automatic checks (re-run whenever the paper changes); errors block publishing
  const checks = useQuery({
    queryKey: ["checks", id, paper.dataUpdatedAt],
    queryFn: () => api.checks(id),
    enabled: !!paper.data?.extraction,
  });
  const estimate = useQuery({
    queryKey: ["reprocess-estimate", id],
    queryFn: () => api.reprocessEstimate(id),
    enabled: confirm === "reprocess",
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const reprocess = useMutation({
    mutationFn: () => api.reprocess(id),
    onSuccess: (r) => {
      if ("draft" in r && r.draft)
        toast.success("AI is reading the paper again", {
          description:
            "The result comes back as a draft to compare. The live paper is not changed.",
        });
      else toast.success("Processing again");
      queryClient.invalidateQueries({ queryKey: ["paper", id] });
      queryClient.invalidateQueries({ queryKey: ["draft", id] });
      queryClient.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (err) => toast.error(err.message),
  });
  // Re-cut the worksheet crops (question paper + mark scheme) from the original PDFs
  const recrop = useMutation({
    mutationFn: () => api.rebuildCrops(id),
    onSuccess: (r) => {
      toast.success(
        `Worksheet crops cut for ${r.qp} question parts and ${r.ms} mark-scheme parts`,
        {
          description: r.notFound.length
            ? `No question crop yet: ${r.notFound.join(", ")} (draw them in the Worksheet tab)`
            : undefined,
        },
      );
      queryClient.invalidateQueries({ queryKey: ["paper", id] });
    },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: () => api.remove(id),
    onSuccess: () => {
      toast.success("Paper deleted");
      queryClient.invalidateQueries({ queryKey: ["papers"] });
      navigate("/admin/papers", { viewTransition: true });
    },
    onError: (err) => toast.error(err.message),
  });
  const setPublishedState = useMutation({
    mutationFn: (publish: boolean) =>
      publish ? api.publish(id) : api.unpublish(id),
    onSuccess: (_data, publish) => {
      queryClient.invalidateQueries({ queryKey: ["paper", id] });
      queryClient.invalidateQueries({ queryKey: ["papers"] });
      queryClient.invalidateQueries({ queryKey: ["bank"] });
      if (publish) {
        toast.success("Published. Students can now see these questions.", {
          action: {
            label: "View",
            onClick: () =>
              navigate(`/?subject=${paper.data?.meta.subjectCode ?? ""}`, {
                viewTransition: true,
              }),
          },
        });
      } else {
        toast.success("Unpublished");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  if (paper.isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-80" />
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-[32rem] rounded-xl" />
        </div>
      </div>
    );
  }
  if (paper.isError)
    return <Card className="p-6 text-destructive">{paper.error.message}</Card>;

  const { meta, status, extraction } = paper.data;
  const processing = isProcessing(status);
  const questions: ReviewedQuestion[] = extraction?.questions ?? [];
  const verifiedCount = questions.filter((q) => q.status !== "DRAFT").length;
  const allVerified =
    questions.length > 0 && verifiedCount === questions.length;
  const published = meta.paperState === "PUBLISHED";
  const topics =
    catalog.data?.subjects.find((s) => s.code === meta.subjectCode)?.topics ??
    [];

  const listed = questions.filter(
    (q) =>
      listFilter === "all" ||
      (listFilter === "todo" ? q.status === "DRAFT" : q.status !== "DRAFT"),
  );
  const selectedId = params.get("q");
  const selectedIndex = Math.max(
    0,
    questions.findIndex((q) => q.id === selectedId),
  );
  const selected = questions[selectedIndex] as ReviewedQuestion | undefined;
  const select = (qid: string) => setParams({ q: qid }, { replace: true });
  const checkErrors = (checks.data ?? []).filter(
    (i) => i.severity === "error",
  ).length;

  // parts that would print in the typed layout (no crop from the paper yet)
  const noCrop = questions.filter((q) => !(q.crops ?? []).some((c) => c.path));
  const publish = () =>
    noCrop.length
      ? setConfirm("publishMissing")
      : setPublishedState.mutate(true);
  const verifyAll = async () => {
    try {
      const r = await api.verifyAll(id);
      toast.success(
        `${r.verified} question${r.verified === 1 ? "" : "s"} verified`,
      );
      await queryClient.invalidateQueries({ queryKey: ["paper", id] });
      await queryClient.invalidateQueries({ queryKey: ["papers"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="grid gap-5">
      <AdminPageBar>
        <Link
          viewTransition
          to="/admin/papers"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Papers
        </Link>
      </AdminPageBar>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {sourceLine(meta)}
            </h1>
            {published ? (
              <Badge className="gap-1 border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <Globe className="size-3" /> Published
              </Badge>
            ) : (
              <Badge className="border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400">
                In review
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {meta.curriculum} · {meta.subjectName} ({meta.subjectCode})
            {meta.componentName ? ` · ${meta.componentName}` : ""}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="size-3.5" /> {meta.qpFileName}
            </span>
            {meta.msFileName && (
              <span className="flex items-center gap-1">
                <FileText className="size-3.5" /> {meta.msFileName}
              </span>
            )}
            {extraction && (
              <span>
                AI:{" "}
                {extraction.provider === "mock"
                  ? "sample data (mock)"
                  : extraction.model}
              </span>
            )}
          </div>
        </div>

        {!processing && (
          <div className="flex items-center gap-2">
            {published ? (
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => setConfirm("unpublish")}
              >
                <GlobeLock className="size-4" /> Unpublish
              </Button>
            ) : (
              <Button
                size="lg"
                className="gap-1.5"
                disabled={
                  !allVerified || checkErrors > 0 || setPublishedState.isPending
                }
                onClick={publish}
                title={
                  checkErrors
                    ? "Fix the problems listed under Checks first"
                    : allVerified
                      ? "Make these questions visible to students"
                      : "Verify every question first"
                }
              >
                <Globe className="size-4" /> Publish
              </Button>
            )}
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-lg"
                    aria-label="More actions"
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 gap-0 p-1" onClick={() => setMenuOpen(false)}>
                {!allVerified && (
                  <MenuItem
                    icon={<CheckCircle2 className="size-4" />}
                    onClick={() => setConfirm("verifyAll")}
                  >
                    Verify all questions
                  </MenuItem>
                )}
                <MenuItem
                  icon={<Crop className="size-4" />}
                  onClick={() => setConfirm("recrop")}
                >
                  {recrop.isPending
                    ? "Cutting worksheet crops…"
                    : "Re-cut worksheet crops"}
                </MenuItem>
                <MenuItem
                  icon={<History className="size-4" />}
                  onClick={() => setHistoryOpen(true)}
                >
                  History &amp; restore
                </MenuItem>
                <MenuItem
                  icon={<RotateCcw className="size-4" />}
                  onClick={() => setConfirm("reprocess")}
                >
                  Re-process with AI
                </MenuItem>
                <MenuItem
                  icon={<Trash2 className="size-4" />}
                  destructive
                  onClick={() => setConfirm("delete")}
                >
                  Delete paper
                </MenuItem>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {processing && status && <ProcessingCard status={status} />}

      {status?.state === "FAILED" && (
        <Card className="flex-row items-start gap-3 border-destructive/40 px-5 py-4">
          <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="grid gap-1">
            <p className="font-medium">Processing failed</p>
            <p className="text-sm break-words text-muted-foreground">
              {status.error}
            </p>
            <p className="text-sm text-muted-foreground">
              Fix the problem (e.g. the API key in .env), then use “Re-process
              with AI”.
            </p>
          </div>
        </Card>
      )}

      {extraction && !processing && (
        <>
          {/* Review progress */}
          <Card className="gap-2 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {allVerified
                  ? "All questions verified"
                  : `${verifiedCount} of ${questions.length} questions verified`}
              </span>
              <span className="text-muted-foreground">
                {allVerified
                  ? published
                    ? "Live for students"
                    : "Ready to publish"
                  : `${questions.length - verifiedCount} left to review`}
              </span>
            </div>
            <Progress
              value={
                questions.length ? (verifiedCount / questions.length) * 100 : 0
              }
            />
          </Card>

          <DraftBanner paperId={id} />
          <ChecksCard issues={checks.data} onSelect={select} />

          {questions.length === 0 ? (
            <Card className="px-6 py-12 text-center text-muted-foreground">
              No questions found in this paper. Try “Re-process with AI”.
            </Card>
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              {/* Question list */}
              <Card className="gap-0 p-0 lg:sticky lg:top-4">
                <div className="border-b p-2">
                  <Segmented
                    size="sm"
                    className="w-full sm:w-full"
                    aria-label="Show questions"
                    value={listFilter}
                    onChange={setListFilter}
                    options={[
                      { value: "all", label: `All ${questions.length}` },
                      {
                        value: "todo",
                        label: `To review ${questions.length - verifiedCount}`,
                      },
                      { value: "done", label: `Done ${verifiedCount}` },
                    ]}
                  />
                </div>
                <nav className="flex gap-1 overflow-x-auto p-2 lg:grid lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
                  {listed.length === 0 && (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      Nothing here
                    </p>
                  )}
                  {listed.map((q) => (
                    <QuestionListItem
                      key={q.id}
                      q={q}
                      active={q.id === selected?.id}
                      onClick={() => select(q.id)}
                    />
                  ))}
                </nav>
              </Card>

              {/* Editor */}
              {selected && (
                <QuestionEditor
                  // Remount (fresh form) whenever the saved question changes on the server.
                  key={`${selected.id}:${questionVersion(selected)}`}
                  paperId={id}
                  meta={meta}
                  question={selected}
                  topics={topics}
                  position={{ index: selectedIndex, total: questions.length }}
                  onPrev={
                    selectedIndex > 0
                      ? () => select(questions[selectedIndex - 1].id)
                      : null
                  }
                  onNext={
                    selectedIndex < questions.length - 1
                      ? () => select(questions[selectedIndex + 1].id)
                      : null
                  }
                />
              )}
            </div>
          )}
        </>
      )}

      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        paperId={id}
      />
      <ConfirmDialog
        open={confirm === "reprocess"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Re-process this paper?"
        description={
          <>
            {questions.length
              ? "A backup is saved first. The AI reads the whole paper again into a draft; the live paper (and its published state) stays as it is until you compare and choose which parts to take."
              : "The AI reads the whole paper again."}
            <span className="mt-2 block font-medium text-foreground">
              {estimate.data
                ? `Estimated AI cost: about US$${estimate.data.usdLow.toFixed(2)}–${estimate.data.usdHigh.toFixed(2)} (${estimate.data.pages} pages, ${estimate.data.model})`
                : "Estimating cost…"}
            </span>
          </>
        }
        confirmLabel="Re-process"
        onConfirm={() => reprocess.mutate()}
      />
      <ConfirmDialog
        open={confirm === "recrop"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Re-cut the worksheet crops?"
        description="Each part is cut again from the original question paper and mark scheme (as it prints in downloaded worksheets). A part's crop is only replaced when it is found reliably, so crops drawn by hand are kept. Takes about a minute."
        confirmLabel="Re-cut"
        onConfirm={() => recrop.mutate()}
      />
      <ConfirmDialog
        open={confirm === "publishMissing"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Publish with ${noCrop.length} part${noCrop.length === 1 ? "" : "s"} not cropped?`}
        description={`${noCrop.map((q) => `Q${q.number}`).join(", ")} ${noCrop.length === 1 ? "has" : "have"} no crop from the paper, so in downloaded worksheets ${noCrop.length === 1 ? "it prints" : "they print"} in the typed layout. You can add ${noCrop.length === 1 ? "it" : "them"} later in the Worksheet tab.`}
        confirmLabel="Publish anyway"
        onConfirm={() => setPublishedState.mutate(true)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this paper?"
        description={`${meta.id} and all its extracted questions are removed for everyone. This can't be undone.`}
        confirmLabel="Delete paper"
        destructive
        onConfirm={() => remove.mutate()}
      />
      <ConfirmDialog
        open={confirm === "verifyAll"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Verify all questions?"
        description={`Marks the remaining ${questions.length - verifiedCount} questions as checked. Only do this after you have reviewed them (text, answers and diagrams).`}
        confirmLabel="Verify all"
        onConfirm={() => void verifyAll()}
      />
      <ConfirmDialog
        open={confirm === "unpublish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Unpublish this paper?"
        description="Students will no longer see these questions. Your edits are kept."
        confirmLabel="Unpublish"
        onConfirm={() => setPublishedState.mutate(false)}
      />
    </div>
  );
}

/** Cheap fingerprint of a question's saved content. */
function questionVersion(q: ReviewedQuestion): string {
  const s = JSON.stringify(q);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

function QuestionListItem({
  q,
  active,
  onClick,
}: {
  q: ReviewedQuestion;
  active: boolean;
  onClick: () => void;
}) {
  const low = q.confidence < 0.7;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={cn(
        "flex w-44 shrink-0 items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors lg:w-full",
        active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted",
      )}
    >
      {q.status !== "DRAFT" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : low ? (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
      )}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          Q{q.number}
          <span className="text-xs font-normal text-muted-foreground">
            {typeLabel[q.type]}
            {q.marks != null ? ` · ${q.marks}m` : ""}
          </span>
          {q.images.length > 0 && (
            <ImageIcon className="size-3 text-muted-foreground" />
          )}
          {!(q.crops ?? []).some((c) => c.path) && (
            <span title="No worksheet crop: prints in the typed layout">
              <ImageOff className="size-3 text-amber-500" />
            </span>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {q.subtopic || q.topic}
        </span>
      </span>
    </button>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
        destructive && "text-destructive",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
