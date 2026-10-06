import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, FileStack, Globe, Loader2, Upload, XCircle } from "lucide-react";
import { Link } from "react-router";
import { RequireAdmin } from "@/components/require-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api, isProcessing, sourceLine, type PaperMeta, type PaperStatus } from "@/lib/api";

export function AdminPapersPage() {
  return (
    <RequireAdmin>
      <PapersList />
    </RequireAdmin>
  );
}

function PapersList() {
  const papers = useQuery({
    queryKey: ["papers"],
    queryFn: api.papers,
    refetchInterval: (query) => (query.state.data?.some((p) => isProcessing(p.status)) ? 2000 : false),
  });
  const list = papers.data ?? [];
  // Verified / total counts come with the list from the database.
  const progress = new Map(
    list.map((p) => [p.meta.id, { verified: p.counts.verified, total: p.counts.total, published: p.meta.paperState === "PUBLISHED" }] as const),
  );
  const publishedCount = [...progress.values()].filter((p) => p.published).length;
  const toReview = [...progress.values()].filter((p) => !p.published).length;

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Papers</h1>
          <p className="text-muted-foreground">Review what the AI extracted, fix mistakes, then publish for students.</p>
        </div>
        <Button size="lg" className="gap-1.5" nativeButton={false} render={<Link viewTransition to="/admin/upload" />}>
          <Upload className="size-4" /> Upload paper
        </Button>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Papers" value={list.length} />
          <Stat label="To review" value={toReview} tone="amber" />
          <Stat label="Published" value={publishedCount} tone="emerald" />
        </div>
      )}

      {papers.isPending && (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}
      {papers.isError && <Card className="p-6 text-destructive">{papers.error.message}</Card>}

      {papers.data?.length === 0 && (
        <Card className="items-center gap-3 px-6 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileStack className="size-6" />
          </div>
          <p className="text-lg font-medium">No papers yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Upload a question paper and its mark scheme to get started.</p>
          <Button nativeButton={false} render={<Link viewTransition to="/admin/upload" />}>Upload paper</Button>
        </Card>
      )}

      <div className="grid gap-3">
        {list.map(({ meta, status }, i) => (
          <div key={meta.id} className="enter-up" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
            <PaperRow meta={meta} status={status} progress={progress.get(meta.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" | "emerald" }) {
  return (
    <Card className="gap-0.5 px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={
          tone === "amber" ? "text-2xl font-semibold text-amber-600 dark:text-amber-400" : tone === "emerald" ? "text-2xl font-semibold text-emerald-600 dark:text-emerald-400" : "text-2xl font-semibold"
        }
      >
        {value}
      </p>
    </Card>
  );
}

function PaperRow({ meta, status, progress }: { meta: PaperMeta; status: PaperStatus | null; progress?: { verified: number; total: number; published: boolean } }) {
  const pct = progress && progress.total ? Math.round((progress.verified / progress.total) * 100) : 0;
  return (
    <Link viewTransition to={`/admin/papers/${meta.id}`} className="group">
      <Card className="flex-row items-center gap-4 px-4 py-4 transition-colors group-hover:bg-muted/50 sm:px-5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{meta.paperCode}</div>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <p className="truncate font-medium">{sourceLine(meta)}</p>
          <p className="truncate text-sm text-muted-foreground">
            {meta.curriculum} · {meta.subjectCode}
            {meta.componentName ? ` · ${meta.componentName}` : ""}
          </p>
          {progress && !progress.published && progress.total > 0 && (
            <div className="flex items-center gap-2">
              <Progress value={pct} className="max-w-48 flex-1" />
              <span className="text-xs text-muted-foreground tabular-nums">
                {progress.verified}/{progress.total} verified
              </span>
            </div>
          )}
        </div>
        <RowStatus status={status} progress={progress} />
        <ChevronRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
      </Card>
    </Link>
  );
}

function RowStatus({ status, progress }: { status: PaperStatus | null; progress?: { verified: number; total: number; published: boolean } }) {
  if (status && isProcessing(status))
    return (
      <Badge className="gap-1 border-transparent bg-primary/10 text-primary">
        <Loader2 className="size-3 animate-spin" /> {status.progress}%
      </Badge>
    );
  if (status?.state === "FAILED")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" /> Failed
      </Badge>
    );
  if (progress?.published)
    return (
      <Badge className="gap-1 border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        <Globe className="size-3" /> Published
      </Badge>
    );
  if (progress && progress.total > 0 && progress.verified === progress.total)
    return (
      <Badge className="gap-1 border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-400">
        <CheckCircle2 className="size-3" /> Ready to publish
      </Badge>
    );
  return <Badge className="border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400">In review</Badge>;
}
