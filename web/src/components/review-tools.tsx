import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  History,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, type PaperDraft, type PaperIssue } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Problems an AI reading typically leaves, with a link to each part. Errors block publishing. */
export function ChecksCard({
  issues,
  onSelect,
}: {
  issues: PaperIssue[] | undefined;
  onSelect: (questionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!issues) return null;
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  if (!issues.length)
    return (
      <Card className="flex-row items-center gap-2.5 px-5 py-3 text-sm">
        <ShieldCheck className="size-4 text-emerald-600" /> Checks passed: no
        problems found in this paper's parts.
      </Card>
    );
  const shown = open
    ? issues
    : errors.length
      ? errors.slice(0, 6)
      : warnings.slice(0, 3);
  return (
    <Card
      className={cn(
        "gap-2 px-5 py-4",
        errors.length && "border-destructive/40",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          {errors.length ? (
            <AlertCircle className="size-4 text-destructive" />
          ) : (
            <TriangleAlert className="size-4 text-amber-500" />
          )}
          {errors.length
            ? `${errors.length} problem${errors.length === 1 ? "" : "s"} to fix before publishing`
            : "No blocking problems"}
          {warnings.length ? (
            <span className="font-normal text-muted-foreground">
              · {warnings.length} to check
            </span>
          ) : null}
        </span>
        {issues.length > shown.length || open ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Show fewer" : `Show all ${issues.length}`}
          </Button>
        ) : null}
      </div>
      <ul className="grid gap-1">
        {shown.map((i, k) => (
          <li key={k}>
            <button
              type="button"
              disabled={!i.questionId}
              onClick={() => i.questionId && onSelect(i.questionId)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted disabled:hover:bg-transparent"
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  i.severity === "error" ? "bg-destructive" : "bg-amber-500",
                )}
              />
              <span className="flex-1">{i.message}</span>
              {i.questionId && (
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Backups of the paper (automatic before risky actions) with Restore — whole paper or one question. */
export function HistoryDialog({
  open,
  onOpenChange,
  paperId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  paperId: string;
}) {
  const queryClient = useQueryClient();
  const versions = useQuery({
    queryKey: ["versions", paperId],
    queryFn: () => api.versions(paperId),
    enabled: open,
  });
  const [picking, setPicking] = useState<number | null>(null);
  const parts = useQuery({
    queryKey: ["version-parts", paperId, picking],
    queryFn: () => api.versionParts(paperId, picking!),
    enabled: picking != null,
  });
  const [busy, setBusy] = useState(false);
  const [confirmWhole, setConfirmWhole] = useState<number | null>(null);

  async function restore(versionId: number, questionId?: number) {
    setBusy(true);
    try {
      const r = await api.restoreVersion(paperId, versionId, questionId);
      toast.success(
        questionId
          ? "Question restored"
          : `Paper restored (${r.restored} parts)`,
        {
          description:
            "The state before the restore was backed up too, so this can be undone.",
        },
      );
      setPicking(null);
      await Promise.all(
        ["paper", "versions", "checks", "papers"].map((k) =>
          queryClient.invalidateQueries({
            queryKey: k === "papers" ? [k] : [k, paperId],
          }),
        ),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function backupNow() {
    setBusy(true);
    try {
      await api.backupNow(paperId);
      toast.success("Backup saved");
      await queryClient.invalidateQueries({ queryKey: ["versions", paperId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const list = (versions.data ?? []).filter((v) => v.kind === "SNAPSHOT");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-3 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5" /> History &amp; restore
          </DialogTitle>
          <DialogDescription>
            A backup is saved automatically before every re-process, re-cut,
            delete, edit, merge or split. Restore brings back the whole paper or
            one question; the current state is backed up first, so a restore can
            be undone too.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void backupNow()}
          >
            Save a backup now
          </Button>
        </div>
        {versions.isPending ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : !list.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No backups yet. One is saved automatically before the next change.
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {list.map((v) => (
              <li key={v.id} className="rounded-lg border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="grid">
                    <span className="text-sm font-medium">{v.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString()} ·{" "}
                      {v.questionId
                        ? "one question"
                        : `whole paper, ${v.parts} parts`}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {!v.questionId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          setPicking(picking === v.id ? null : v.id)
                        }
                      >
                        One question…
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={busy}
                      onClick={() => {
                        if (v.questionId) void restore(v.id, v.questionId);
                        else setConfirmWhole(v.id);
                      }}
                    >
                      <RotateCcw className="size-3.5" />{" "}
                      {v.questionId ? "Restore question" : "Restore paper"}
                    </Button>
                  </div>
                </div>
                {picking === v.id && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
                    {(parts.data ?? []).map((p) => (
                      <Button
                        key={p.id}
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void restore(v.id, p.id)}
                        title="Restore this question from the backup"
                      >
                        Q{p.number}
                        {p.deleted ? " (deleted)" : ""}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <ConfirmDialog
          open={confirmWhole != null}
          onOpenChange={(o) => !o && setConfirmWhole(null)}
          title="Restore the whole paper to this backup?"
          description="All parts, answers and crops go back to how they were in this backup. The current state is backed up first, so this can be undone."
          confirmLabel="Restore paper"
          onConfirm={() => confirmWhole != null && void restore(confirmWhole)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Shown when a re-process has finished: the AI's new reading waits as a draft; the live paper is unchanged. */
export function DraftBanner({ paperId }: { paperId: string }) {
  const draft = useQuery({
    queryKey: ["draft", paperId],
    queryFn: () => api.draft(paperId),
    refetchInterval: 15_000,
  });
  const [open, setOpen] = useState(false);
  if (!draft.data) return null;
  const d = draft.data;
  const changed = d.rows.filter((r) => !r.same).length;
  return (
    <>
      <Card className="flex-row flex-wrap items-center justify-between gap-3 border-primary/40 bg-primary/5 px-5 py-4">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="grid gap-0.5 text-sm">
            <span className="font-medium">AI draft ready: {d.label}</span>
            <span className="text-muted-foreground">
              {changed} of {d.rows.length} parts differ from the live paper. The
              live paper is unchanged until you choose what to take.
            </span>
          </div>
        </div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          Compare &amp; choose
        </Button>
      </Card>
      <CompareDialog
        open={open}
        onOpenChange={setOpen}
        paperId={paperId}
        draft={d}
      />
    </>
  );
}

function CompareDialog({
  open,
  onOpenChange,
  paperId,
  draft,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  paperId: string;
  draft: PaperDraft;
}) {
  const queryClient = useQueryClient();
  const [take, setTake] = useState<Set<string>>(new Set());
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const rows = draft.rows.filter((r) => !onlyChanged || !r.same);
  const toggle = (k: string) =>
    setTake((t) =>
      t.has(k) ? new Set([...t].filter((x) => x !== k)) : new Set([...t, k]),
    );
  const refresh = () =>
    Promise.all(
      ["paper", "draft", "checks", "versions"].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k, paperId] }),
      ),
    );

  async function apply() {
    setBusy(true);
    try {
      const r = await api.applyDraft(paperId, draft.id, [...take]);
      toast.success(
        `${r.taken} part${r.taken === 1 ? "" : "s"} taken from the AI draft`,
        {
          description:
            "The paper was backed up first (History & restore). Worksheet crops are being re-cut.",
        },
      );
      onOpenChange(false);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    await api
      .discardDraft(paperId, draft.id)
      .catch((e) => toast.error((e as Error).message));
    onOpenChange(false);
    await refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-3 overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Compare the AI draft with the live paper</DialogTitle>
          <DialogDescription>
            Tick the parts where the AI's new reading is better. Everything else
            stays exactly as it is now.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyChanged}
            onChange={(e) => setOnlyChanged(e.target.checked)}
          />{" "}
          Show only parts that differ
        </label>
        <div className="grid gap-2">
          {rows.map((r) => (
            <div
              key={r.key}
              className={cn(
                "grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_1fr_1fr]",
                take.has(r.key) && "border-primary ring-1 ring-primary/30",
              )}
            >
              <label className="flex items-start gap-2 pt-0.5 text-sm font-semibold">
                <input
                  type="checkbox"
                  disabled={!r.draft}
                  checked={take.has(r.key)}
                  onChange={() => toggle(r.key)}
                />
                Q{r.draft?.number ?? r.current?.number}
              </label>
              <Side
                title="Live paper"
                side={r.current}
                empty="Not in the live paper (new part)"
              />
              <Side
                title="AI draft"
                side={r.draft}
                empty="Not in the AI draft (the live part is kept)"
              />
            </div>
          ))}
          {!rows.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              The AI draft matches the live paper.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => setConfirmDiscard(true)}
          >
            Discard draft
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Later
            </Button>
            <Button disabled={busy || !take.size} onClick={() => void apply()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Take{" "}
              {take.size} part{take.size === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogFooter>
        <ConfirmDialog
          open={confirmDiscard}
          onOpenChange={setConfirmDiscard}
          title="Discard this AI draft?"
          description="The live paper stays exactly as it is."
          confirmLabel="Discard draft"
          destructive
          onConfirm={() => void discard()}
        />
      </DialogContent>
    </Dialog>
  );
}

function Side({
  title,
  side,
  empty,
}: {
  title: string;
  side:
    PaperDraft["rows"][number]["draft"] | PaperDraft["rows"][number]["current"];
  empty: string;
}) {
  return (
    <div className="grid content-start gap-1 rounded-md bg-muted/40 p-2 text-xs">
      <span className="font-semibold text-muted-foreground uppercase">
        {title}
      </span>
      {side ? (
        <>
          <span>
            {side.type} · {side.marks ?? "–"} mark{side.marks === 1 ? "" : "s"}{" "}
            · page {side.pages?.join(", ")}
            {side.options ? ` · ${side.options} options` : ""}
          </span>
          <span className="line-clamp-4 whitespace-pre-wrap">{side.text}</span>
          <span className="line-clamp-2 text-muted-foreground">
            Answer: {side.answer || "none"}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground italic">{empty}</span>
      )}
    </div>
  );
}
