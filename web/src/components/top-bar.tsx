import { BookOpenCheck, FileStack, LibraryBig, LogOut, Moon, Settings2, ShieldCheck, Sun, Upload } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { SettingsMenu } from "@/components/settings-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/lib/admin";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** The app logo (links to the questions). `compact`: the name only from laptops up. */
export function Logo({ compact = false, onNameShown }: { compact?: boolean; onNameShown?: (shown: boolean) => void }) {
  const { pathname } = useLocation();
  // compact: just the icon; tapping it on the questions page slides the name out (tap again to hide)
  const [showName, setShowName] = useState(false);
  return (
    <Link
      viewTransition
      to="/"
      aria-label="Paper Analyzer"
      title="Paper Analyzer"
      onClick={(e) => {
        if (compact && pathname === "/") {
          e.preventDefault();
          const next = !showName;
          setShowName(next);
          onNameShown?.(next);
        }
      }}
      className="flex shrink-0 items-center font-semibold tracking-tight"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform active:scale-95 sm:size-8 sm:rounded-lg">
        <BookOpenCheck className="size-4.5" />
      </span>
      {compact ? (
        <span
          aria-hidden={!showName}
          className={cn(
            "grid transition-[grid-template-columns,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            showName ? "ml-2 grid-cols-[1fr] opacity-100" : "ml-0 grid-cols-[0fr] opacity-0",
          )}
        >
          <span className="overflow-hidden whitespace-nowrap">Paper Analyzer</span>
        </span>
      ) : (
        <span className="ml-2">Paper Analyzer</span>
      )}
    </Link>
  );
}

/** Sun / moon: switches light and dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" className={cn("size-9", className)} aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}

/** Admins only: Questions / Papers tabs, Upload, log out. Students have no bar (the page uses all the space). */
export function TopBar() {
  const { isAdmin, logout } = useAdmin();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!isAdmin) return null;

  return (
    <header data-topbar className="sticky top-0 z-40 border-b bg-card pt-[env(safe-area-inset-top)] lg:bg-card/90 lg:backdrop-blur lg:supports-backdrop-filter:bg-card/75">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-4">
        <Link viewTransition to="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpenCheck className="size-4.5" />
          </span>
          {/* Students: the name is the whole header. Admins: icon only on phones, to fit the admin tabs. */}
          <span className={cn(isAdmin && "hidden md:inline")}>Paper Analyzer</span>
        </Link>

        {/* Students have one page, so no tabs; admins switch between Questions and Papers */}
        <nav className={cn("flex items-center gap-1", !isAdmin && "hidden")}>
            <NavItem to="/" end icon={<LibraryBig className="size-4" />}>
              Questions
            </NavItem>
            {isAdmin && (
              <NavItem to="/admin/papers" icon={<FileStack className="size-4" />}>
                Papers
              </NavItem>
            )}
            {isAdmin && (
              <NavItem to="/admin/settings" icon={<Settings2 className="size-4" />}>
                Settings
              </NavItem>
            )}
          </nav>

        {pathname === "/" && (
          <div className="hidden min-w-0 border-l pl-4 leading-tight lg:block">
            <p className="truncate text-sm font-semibold">Practice questions</p>
            <p className="hidden truncate text-xs text-muted-foreground xl:block">Real past paper questions with official answers and the exact source of each one.</p>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {isAdmin && (
            <Badge variant="secondary" className="mr-1 hidden gap-1 lg:inline-flex">
              <ShieldCheck className="size-3.5" /> Admin
            </Badge>
          )}
          <SettingsMenu />
          <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            <Sun className="size-4 dark:hidden" />
            <Moon className="hidden size-4 dark:block" />
          </Button>
          {isAdmin && (
            <Button variant="ghost" size="icon" aria-label="Log out" title="Log out" onClick={logout}>
              <LogOut className="size-4" />
            </Button>
          )}
          {/* Admin tools are invisible to students; admins sign in at /admin */}
          {isAdmin && (
            <Button onClick={() => navigate("/admin/upload", { viewTransition: true })} size="lg" className="ml-1 gap-1.5 px-3" aria-label="Upload">
              <Upload className="size-4" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, end, icon, children }: { to: string; end?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink viewTransition
      to={to}
      end={end}
      aria-label={typeof children === "string" ? children : undefined}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          isActive && "bg-muted text-foreground",
        )
      }
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </NavLink>
  );
}
