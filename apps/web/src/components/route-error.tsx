import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const RELOAD_KEY = "pa.chunkReloadAt";

/** A page chunk failed to load: usually a new deploy or a dev-server restart while the tab was open. */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

export function RouteError() {
  const error = useRouteError();
  const chunkError = isChunkLoadError(error);

  // Reload once to pick up the current files; the timestamp guard prevents a reload loop.
  useEffect(() => {
    if (!chunkError) return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last < 10_000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [chunkError]);

  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "Something went wrong";
  const detail = chunkError
    ? "The app was updated. Please reload the page."
    : error instanceof Error
      ? error.message
      : "Unexpected error.";

  return (
    <Card className="mx-auto mt-6 max-w-md items-center gap-3 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" />
      </div>
      <p className="text-lg font-medium">{title}</p>
      <p className="text-sm break-words text-muted-foreground">{detail}</p>
      <div className="flex gap-2">
        <Button className="gap-1.5" onClick={() => window.location.reload()}>
          <RotateCcw className="size-4" /> Reload
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link viewTransition to="/" />}>
          All papers
        </Button>
      </div>
    </Card>
  );
}
