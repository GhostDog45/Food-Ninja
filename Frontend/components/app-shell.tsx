"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { NavItem } from "@/lib/platform";
import { getAuthUser, apiLogout, type AuthUser } from "@/lib/backend";
import { cn } from "./ui";
import { useToast } from "./toast-provider";

export function AppShell({
  role,
  title,
  subtitle,
  nav,
  actions,
  children,
}: {
  role: string;
  title: string;
  subtitle: string;
  nav: NavItem[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const isAdmin = role.toLowerCase().includes("admin");

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  async function handleLogout() {
    try {
      await apiLogout();
      toast("Signed out successfully", "default");
      router.push("/login");
    } catch {
      router.push("/login");
    }
  }

  return (
    <div className={cn("light-app min-h-screen text-slate-900", isAdmin ? "bg-[#f3f5f2]" : "bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_28%),linear-gradient(180deg,#fffaf2_0%,#f6f1e8_100%)]")}>
      <div className="min-h-screen px-4 py-4 md:px-6 lg:px-8">
        <div className="space-y-6">
          <header className={cn("w-full px-4 py-3 backdrop-blur", isAdmin ? "border-b border-slate-200 bg-white" : "rounded-3xl border border-black/5 bg-white/85 shadow-sm")}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn("px-4 py-2 text-sm transition md:hidden", isAdmin ? "rounded-lg border border-slate-200 bg-white text-slate-700" : "rounded-full border border-black/10 bg-white text-slate-700 shadow-sm hover:bg-slate-50")}
                  onClick={() => setOpen(true)}
                >
                  Menu
                </button>
              </div>

              <Link href="/" className="justify-self-center text-center">
                <p className={cn("text-sm uppercase tracking-[0.22em]", isAdmin ? "font-semibold text-emerald-800" : "text-amber-700")}>Food Ninja</p>
              </Link>

              <div className="flex items-center justify-end gap-2">
                {actions}
                {user ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className={cn("px-3.5 py-1.5 text-xs font-semibold transition", isAdmin ? "rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50" : "rounded-full border border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/20")}
                  >
                    Sign out
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/20"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </div>

          </header>

          <div className="flex gap-6">
            <aside
                className={cn(
                "fixed inset-y-0 left-0 z-40 w-80 transform p-4 transition md:static md:translate-x-0",
                isAdmin ? "border-r border-slate-800 bg-[#19251f] text-white shadow-xl md:w-72 md:rounded-xl" : "border-r border-black/10 bg-[#fffaf2]/95 shadow-xl backdrop-blur-xl md:rounded-3xl md:border",
                open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
              )}
            >
              <div className="flex h-full flex-col gap-4">
                <div className={cn("p-4", isAdmin ? "border-b border-white/10" : "rounded-2xl bg-panel-muted/90")}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn("text-xs uppercase tracking-[0.22em]", isAdmin ? "text-emerald-300" : "text-amber-700")}>{role}</p>
                      <h1 className={cn("mt-1 text-2xl font-semibold", isAdmin ? "text-white" : "text-slate-900")}>{title}</h1>
                    </div>
                    <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", isAdmin ? "border-emerald-800 bg-emerald-900/60 text-emerald-200" : "border-emerald-200 bg-emerald-100 text-emerald-800")}>
                      Live
                    </span>
                  </div>
                  <p className={cn("mt-3 text-sm leading-6", isAdmin ? "text-slate-300" : "text-slate-600")}>{subtitle}</p>
                </div>

                <nav className="flex flex-1 flex-col gap-2 overflow-auto">
                  {nav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      className={cn("rounded-lg px-3 py-3 transition", isAdmin ? pathname === item.href ? "border-l-2 border-emerald-300 bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white" : "rounded-2xl border border-black/5 bg-white/80 shadow-sm hover:border-amber-200 hover:bg-amber-50")}
                      onClick={() => setOpen(false)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={cn("font-medium", isAdmin ? "text-inherit" : "text-slate-800")}>{item.label}</span>
                        <span className={cn("text-xs", isAdmin ? "text-slate-400" : "text-slate-500")}>{item.hint}</span>
                      </div>
                    </Link>
                  ))}
                </nav>

                <div className={cn("p-4", isAdmin ? "border-t border-white/10" : "rounded-2xl bg-amber-50")}>
                  <p className={cn("text-sm font-medium", isAdmin ? "text-white" : "text-slate-800")}>
                    {user ? `Logged in as: ${user.username}` : "Guest session"}
                  </p>
                  <p className={cn("mt-1 text-xs", isAdmin ? "text-slate-400" : "text-slate-600")}>
                    {user ? `Role: ${user.user_type}` : "Sign in to access personalized orders and settings."}
                  </p>
                </div>
              </div>
            </aside>

            {open ? (
              <button
                type="button"
                className="fixed inset-0 z-30 bg-slate-950/35 md:hidden"
                aria-label="Close sidebar"
                onClick={() => setOpen(false)}
              />
            ) : null}

            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
