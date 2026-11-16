import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Atom, BookOpen, Building2, CheckCircle2, ChevronRight, FileStack, Globe, GraduationCap, LayoutGrid, Loader2, Rows3, Search, Sigma, Upload, XCircle } from "lucide-react";
import { AdminPageBar } from "@/components/admin-menu";
import { Link, useSearchParams } from "react-router";
import { RequireAdmin } from "@/components/require-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api, isProcessing, sourceLine, type PaperListItem, type PaperMeta, type PaperStatus } from "@/lib/api";

type Sort = "newest" | "oldest" | "review" | "published";
const CURRICULUM_ORDER = ["Edexcel", "IAL", "AQA", "Oxford AQA", "KS3"];
type Show = "all" | "review" | "published";
type View = "groups" | "cards";

const PREF_KEY = "pa.adminPapers";
function readPrefs(): { sort: Sort; view: View } {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}");
    return { sort: v.sort ?? "newest", view: v.view ?? "groups" };
  } catch {
    return { sort: "newest", view: "groups" };
  }
}
function writePrefs(p: { sort: Sort; view: View }) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    // private mode: the choice just isn't remembered
  }
}

/** Jan < May/June < Oct/Nov inside a year, so "newest first" is a real timeline. */
const seasonRank = (m: PaperMeta) => (/oct|nov|win/i.test(m.seasonName) ? 3 : /may|jun|sum/i.test(m.seasonName) ? 2 : /jan/i.test(m.seasonName) ? 1 : 0);
const isPublished = (p: PaperListItem) => p.meta.paperState === "PUBLISHED";

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

  const [prefs, setPrefs] = useState(readPrefs);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const setPref = (next: Partial<typeof prefs>) =>
    setPrefs((p) => {
      const n = { ...p, ...next };
      writePrefs(n);
      return n;
    });

  // The gallery path lives in the address (?subject=Physics&board=Pearson Edexcel&level=Edexcel A Level), so Back works.
  const [params, setParams] = useSearchParams();
  const subject = params.get("subject");
  const board = subject ? params.get("board") : null;
  const level = board ? params.get("level") : null;
  const goTo = (next: { subject?: string | null; board?: string | null; level?: string | null }) => {
    const p = new URLSearchParams();
    if (next.subject) p.set("subject", next.subject);
    if (next.subject && next.board) p.set("board", next.board);
    if (next.subject && next.board && next.level) p.set("level", next.level);
    setParams(p);
  };

  const searching = q.trim() !== "" || show !== "all";
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = list.filter((p) => {
      if (show === "review" && isPublished(p)) return false;
      if (show === "published" && !isPublished(p)) return false;
      const hay = `${p.meta.seasonName} ${p.meta.year} paper ${p.meta.paperCode} ${p.meta.subjectName} ${p.meta.subjectCode} ${p.meta.board} ${p.meta.curriculum} ${p.meta.componentName ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const when = (m: PaperMeta) => m.year * 10 + seasonRank(m);
    out.sort((a, b) => {
      if (prefs.sort === "review" || prefs.sort === "published") {
        const d = Number(isPublished(a)) - Number(isPublished(b));
        if (d) return prefs.sort === "review" ? d : -d;
      }
      return prefs.sort === "oldest" ? when(a.meta) - when(b.meta) : when(b.meta) - when(a.meta);
    });
    return out;
  }, [list, q, show, prefs.sort]);

  // What the gallery shows now: boxes for the next step down, or (at the last step) the papers themselves.
  const step = !subject ? "subject" : !board ? "board" : !level ? "level" : "papers";
  const inPath = list.filter((p) => (!subject || p.meta.subjectName === subject) && (!board || p.meta.board === board) && (!level || p.meta.curriculum === level));
  const tiles = useMemo(() => {
    if (step === "papers") return [];
    const keyOf = (p: PaperListItem) => (step === "subject" ? p.meta.subjectName : step === "board" ? p.meta.board : p.meta.curriculum);
    const by = new Map<string, { key: string; sub: string; papers: number; published: number }>();
    for (const p of inPath) {
      const k = keyOf(p);
      const t = by.get(k) ?? { key: k, sub: step === "level" ? p.meta.subjectCode : "", papers: 0, published: 0 };
      t.papers++;
      if (isPublished(p)) t.published++;
      by.set(k, t);
    }
    // curriculums in the fixed order (Edexcel, IAL, AQA, Oxford AQA, KS3), everything else by name
    const rank = (k: string) => (step === "board" && CURRICULUM_ORDER.includes(k) ? CURRICULUM_ORDER.indexOf(k) : 99);
    return [...by.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
  }, [step, inPath]);
  const paperItems = searching ? shown : step === "papers" ? shown.filter((p) => p.meta.subjectName === subject && p.meta.board === board && p.meta.curriculum === level) : [];
  const shownCount = paperItems.length;

  return (
    <div className="grid gap-6">
      {/* kept for screen readers; the page starts straight with the stats */}
      <h1 className="sr-only">Papers</h1>
      <AdminPageBar>
        <Button className="ml-auto h-10 gap-1.5 sm:h-9" nativeButton={false} render={<Link viewTransition to="/admin/upload" />}>
          <Upload className="size-4" /> Upload paper
        </Button>
      </AdminPageBar>

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

      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: Jan 2024, WME01, 8PH0 …" className="h-9 pl-9" aria-label="Search papers" />
          </div>
          <div className="flex gap-1" role="group" aria-label="Show">
            {(["all", "review", "published"] as const).map((v) => (
              <Button key={v} type="button" size="sm" variant={show === v ? "default" : "outline"} className="h-9" onClick={() => setShow(v)}>
                {v === "all" ? "All" : v === "review" ? "Needs review" : "Published"}
              </Button>
            ))}
          </div>
          <select
            value={prefs.sort}
            onChange={(e) => setPref({ sort: e.target.value as Sort })}
            aria-label="Sort papers"
            className="h-9 rounded-lg border bg-background px-2.5 text-sm"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="review">Needs review first</option>
            <option value="published">Published first</option>
          </select>
          <div className="ml-auto flex gap-1" role="group" aria-label="View">
            <Button type="button" size="icon" variant={prefs.view === "groups" ? "default" : "outline"} className="size-9" aria-label="Compact list by subject" title="Compact list by subject" onClick={() => setPref({ view: "groups" })}>
              <Rows3 className="size-4" />
            </Button>
            <Button type="button" size="icon" variant={prefs.view === "cards" ? "default" : "outline"} className="size-9" aria-label="Cards" title="Cards" onClick={() => setPref({ view: "cards" })}>
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* where you are: Subject > Board > Level */}
      {list.length > 0 && !searching && (
        <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1 text-sm">
          <Crumb label="All subjects" active={step === "subject"} onClick={() => goTo({})} />
          {subject && (
            <>
              <ChevronRight className="size-4 text-muted-foreground" />
              <Crumb label={subject} active={step === "board"} onClick={() => goTo({ subject })} />
            </>
          )}
          {subject && board && (
            <>
              <ChevronRight className="size-4 text-muted-foreground" />
              <Crumb label={board} active={step === "level"} onClick={() => goTo({ subject, board })} />
            </>
          )}
          {subject && board && level && (
            <>
              <ChevronRight className="size-4 text-muted-foreground" />
              <Crumb label={level} active onClick={() => goTo({ subject, board, level })} />
            </>
          )}
        </nav>
      )}

      {/* the boxes: Subject first, then Board, then Level */}
      {list.length > 0 && !searching && step !== "papers" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => {
            const toReview = t.papers - t.published;
            const Icon = step === "subject" ? (/phys/i.test(t.key) ? Atom : /math/i.test(t.key) ? Sigma : BookOpen) : step === "board" ? Building2 : GraduationCap;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => goTo(step === "subject" ? { subject: t.key } : step === "board" ? { subject, board: t.key } : { subject, board, level: t.key })}
                className="group text-left"
              >
                <Card className="h-full flex-row items-center gap-4 px-4 py-5 transition-colors group-hover:bg-muted/50 sm:px-5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-6" />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="truncate text-lg font-medium">{t.key}</p>
                    {t.sub && <p className="truncate text-xs text-muted-foreground">{t.sub}</p>}
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {t.papers} paper{t.papers === 1 ? "" : "s"} · {t.published} published
                      {toReview > 0 && <span className="text-amber-600 dark:text-amber-400"> · {toReview} to review</span>}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {/* the papers: at the last step, or as search / filter results across everything */}
      {list.length > 0 && searching && shownCount === 0 && <Card className="px-6 py-8 text-center text-sm text-muted-foreground">No paper matches. Clear the search or the filter.</Card>}
      {shownCount > 0 &&
        (prefs.view === "cards" ? (
          <div className="grid gap-3">
            {paperItems.map(({ meta, status }, i) => (
              <div key={meta.id} className="enter-up" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                <PaperRow meta={meta} status={status} progress={progress.get(meta.id)} />
              </div>
            ))}
          </div>
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            <ul className="divide-y">
              {paperItems.map(({ meta, status }) => (
                <li key={meta.id}>
                  <CompactRow meta={meta} status={status} progress={progress.get(meta.id)} ctx={searching ? `${meta.subjectName} · ${meta.board} · ${meta.curriculum}` : undefined} />
                </li>
              ))}
            </ul>
          </Card>
        ))}
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

function Crumb({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={active ? "rounded-md px-2 py-1 font-medium" : "rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"}
    >
      {label}
    </button>
  );
}

function CompactRow({ meta, status, progress, ctx }: { meta: PaperMeta; status: PaperStatus | null; progress?: { verified: number; total: number; published: boolean }; ctx?: string }) {
  return (
    <Link viewTransition to={`/admin/papers/${meta.id}`} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 sm:px-5">
      <span className="w-36 shrink-0 font-medium">
        {meta.seasonName} {meta.year}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {ctx ? `${ctx} · ` : ""}Paper {meta.paperCode}
        {meta.componentName ? ` · ${meta.componentName}` : ""}
      </span>
      {progress && progress.total > 0 && (
        <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:block">
          {progress.verified}/{progress.total} parts
        </span>
      )}
      <RowStatus status={status} progress={progress} />
      <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
    </Link>
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
