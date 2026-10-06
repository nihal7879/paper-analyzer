import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function NotFoundPage() {
  return (
    <Card className="mx-auto max-w-md items-center gap-3 px-6 py-12 text-center">
      <p className="text-lg font-medium">Page not found</p>
      <Button nativeButton={false} render={<Link viewTransition to="/" />}>Back to papers</Button>
    </Card>
  );
}
