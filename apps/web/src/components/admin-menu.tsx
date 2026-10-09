import { FileStack, LibraryBig, LogOut, Moon, Settings2, ShieldCheck, Sun, Upload } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router";
import { SettingsMenu } from "@/components/settings-menu";
import { Logo } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAdmin } from "@/lib/admin";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Admins only: one button with the admin pages, Upload, light/dark and log out (instead of a navbar, so pages use all the space). */
export function AdminMenu() {
  const { isAdmin, logout } = useAdmin();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className="h-10 shrink-0 gap-1.5 px-3 sm:h-9" aria-label="Admin menu" />}>
        <ShieldCheck className="size-4 text-primary" />
        <span className="max-sm:hidden">Admin</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-0 p-1" onClick={() => setOpen(false)}>
        <MenuLink to="/" end icon={<LibraryBig className="size-4" />}>
          Questions
        </MenuLink>
        <MenuLink to="/admin/papers" icon={<FileStack className="size-4" />}>
          Papers
        </MenuLink>
        <MenuLink to="/admin/upload" icon={<Upload className="size-4" />}>
          Upload paper
        </MenuLink>
        <MenuLink to="/admin/settings" icon={<Settings2 className="size-4" />}>
          Settings
        </MenuLink>
        <div className="my-1 border-t" />
        <MenuButton icon={resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
        </MenuButton>
        <MenuButton icon={<LogOut className="size-4" />} onClick={logout}>
          Log out
        </MenuButton>
      </PopoverContent>
    </Popover>
  );
}

/** First row of an admin page: logo · (back link etc.) · … · display settings + Admin menu. */
export function AdminPageBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <Logo compact />
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <div className="flex shrink-0 items-center gap-1">
        <SettingsMenu />
        <AdminMenu />
      </div>
    </div>
  );
}

const itemClass = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted";

function MenuLink({ to, end, icon, children }: { to: string; end?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink viewTransition to={to} end={end} className={({ isActive }) => cn(itemClass, isActive && "bg-muted font-medium text-primary")}>
      {icon}
      {children}
    </NavLink>
  );
}

function MenuButton({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={itemClass}>
      {icon}
      {children}
    </button>
  );
}
