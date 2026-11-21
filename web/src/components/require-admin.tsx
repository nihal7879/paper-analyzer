import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { LoginDialog } from "@/components/login-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAdmin } from "@/lib/admin";

/** Renders children for admins; otherwise a password prompt card. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, ready } = useAdmin();
  const [loginOpen, setLoginOpen] = useState(false);

  if (!ready) return null;
  if (isAdmin) return <>{children}</>;
  return (
    <Card className="mx-auto max-w-md items-center gap-3 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <LockKeyhole className="size-6" />
      </div>
      <p className="text-lg font-medium">Admin access required</p>
      <p className="text-sm text-muted-foreground">This page is for admins who upload and review papers.</p>
      <Button onClick={() => setLoginOpen(true)}>Enter password</Button>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} onSuccess={() => undefined} />
    </Card>
  );
}











