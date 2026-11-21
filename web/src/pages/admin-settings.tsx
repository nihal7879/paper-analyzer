import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  KeyRound,
  Loader2,
  PlugZap,
  Save,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageBar } from "@/components/admin-menu";
import { RequireAdmin } from "@/components/require-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type AiProviderId, type AiSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AdminSettingsPage() {
  return (
    <RequireAdmin>
      <Settings />
    </RequireAdmin>
  );
}

/** Admin: which AI the app uses for every request, and each AI's key and model (saved in the server's .env). */
function Settings() {
  const queryClient = useQueryClient();
  // refresh now and then so the request counts stay current
  const settings = useQuery({
    queryKey: ["settings-ai"],
    queryFn: api.aiSettings,
    refetchInterval: 10_000,
  });
  const [keys, setKeys] = useState<Partial<Record<AiProviderId, string>>>({});
  const [models, setModels] = useState<Partial<Record<AiProviderId, string>>>(
    {},
  );
  // result of "Test key" per provider (a free call that lists models; no tokens used)
  const [tests, setTests] = useState<
    Partial<Record<AiProviderId, { ok: boolean; message: string } | "testing">>
  >({});
  async function testKey(id: AiProviderId) {
    setTests((t) => ({ ...t, [id]: "testing" }));
    try {
      const r = await api.testAiKey(id);
      setTests((t) => ({ ...t, [id]: r }));
    } catch (e) {
      setTests((t) => ({
        ...t,
        [id]: { ok: false, message: (e as Error).message },
      }));
    }
  }
  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.updateAiSettings>[0]) =>
      api.updateAiSettings(body),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings-ai"], data);
      setKeys({});
      setModels({});
      toast.success("AI settings saved");
    },
    onError: (e) => toast.error(e.message),
  });

  if (settings.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (settings.isError)
    return (
      <Card className="p-6 text-destructive">{settings.error.message}</Card>
    );
  const s: AiSettings = settings.data;
  const dirty =
    Object.values(keys).some(Boolean) || Object.values(models).some(Boolean);

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <AdminPageBar />
      <div className="-mt-1 grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Settings
        </h1>
        <p className="text-muted-foreground">
          Which AI reads uploaded papers, and its key.
        </p>
      </div>

      {/* What is answering right now */}
      <Card className="flex-row items-center gap-3 px-5 py-4">
        <Activity className="size-5 shrink-0 text-primary" />
        <div className="grid gap-0.5 text-sm">
          <span className="font-medium">
            In use now: {labelOf(s, s.inUse.name)} ·{" "}
            <span className="font-mono text-xs">{s.inUse.model}</span>
          </span>
          <span className="text-muted-foreground">
            Every AI request (reading uploaded papers, re-process, worksheet
            crops for papers without text) goes to this one only. Browsing and
            PDF downloads don't use AI.
          </span>
        </div>
      </Card>

      {s.providers.map((p) => {
        const active = s.active === p.id;
        return (
          <Card
            key={p.id}
            className={cn(
              "gap-4 px-5 py-4",
              active && "ring-2 ring-primary/40",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{p.label}</span>
                {active && (
                  <Badge className="gap-1 border-transparent bg-primary/10 text-primary">
                    <CheckCircle2 className="size-3" /> In use
                  </Badge>
                )}
                {!p.keySet && <Badge variant="outline">No key</Badge>}
              </div>
              <div className="flex gap-1.5">
                {p.keySet && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    disabled={tests[p.id] === "testing"}
                    onClick={() => void testKey(p.id)}
                    title="Check the saved key with a free call (no cost)"
                  >
                    {tests[p.id] === "testing" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <PlugZap className="size-3.5" />
                    )}{" "}
                    Test key
                  </Button>
                )}
                {!active && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={save.isPending || (!p.keySet && !keys[p.id])}
                    onClick={() =>
                      save.mutate({
                        provider: p.id,
                        keys: keys[p.id] ? { [p.id]: keys[p.id] } : undefined,
                      })
                    }
                  >
                    Use {p.label.split(" ")[0]}
                  </Button>
                )}
              </div>
            </div>
            {(() => {
              const t = tests[p.id];
              if (!t || t === "testing") return null;
              return (
                <p
                  className={cn(
                    "rounded-md px-3 py-2 text-sm",
                    t.ok
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {t.message}
                </p>
              );
            })()}

            <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
              <div className="grid gap-1.5">
                <Label
                  htmlFor={`key-${p.id}`}
                  className="flex items-center gap-1.5"
                >
                  <KeyRound className="size-3.5" /> API key
                </Label>
                <Input
                  id={`key-${p.id}`}
                  type="password"
                  autoComplete="off"
                  value={keys[p.id] ?? ""}
                  onChange={(e) =>
                    setKeys((k) => ({ ...k, [p.id]: e.target.value }))
                  }
                  placeholder={
                    p.keyMasked
                      ? `Saved: ${p.keyMasked} (type to replace)`
                      : "Paste the key"
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`model-${p.id}`}>Model</Label>
                <Input
                  id={`model-${p.id}`}
                  value={models[p.id] ?? ""}
                  onChange={(e) =>
                    setModels((m) => ({ ...m, [p.id]: e.target.value }))
                  }
                  placeholder={p.model}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Since the server started: <b>{p.usage.requests}</b> request
              {p.usage.requests === 1 ? "" : "s"}
              {p.usage.failures ? (
                <>
                  ,{" "}
                  <span className="text-destructive">
                    {p.usage.failures} failed
                  </span>
                </>
              ) : null}
              {p.usage.lastUsedAt
                ? ` · last used ${new Date(p.usage.lastUsedAt).toLocaleString()}`
                : " · not used yet"}
              {p.usage.lastError ? (
                <span
                  className="block truncate text-destructive"
                  title={p.usage.lastError}
                >
                  Last error: {p.usage.lastError}
                </span>
              ) : null}
            </p>
          </Card>
        );
      })}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Keys are saved only in the server's .env file and are never shown in
          full.
        </p>
        <Button
          className="gap-1.5"
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate({
              keys: Object.fromEntries(
                Object.entries(keys).filter(([, v]) => v),
              ),
              models: Object.fromEntries(
                Object.entries(models).filter(([, v]) => v),
              ),
            })
          }
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}{" "}
          Save
        </Button>
      </div>
    </div>
  );
}

function labelOf(s: AiSettings, name: string): string {
  return (
    s.providers.find((p) => p.id === name)?.label ??
    (name === "mock" ? "Sample data (no AI)" : name)
  );
}
