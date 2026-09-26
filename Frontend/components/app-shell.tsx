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
    <div className="light-app min-h-screen text-slate-900 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_28%),linear-gradient(180deg,#fffaf2_0%,#f6f1e8_100%)]">
      <div className="min-h-screen px-4 py-4 md:px-6 lg:px-8">
        <div className="space-y-6">
          <header className="w-full px-4 py-3 backdrop-blur rounded-3xl border border-black/5 bg-white/85 shadow-sm">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-black/10 bg-white text-slate-700 shadow-sm hover:bg-slate-50 px-4 py-2 text-sm transition md:hidden"
                  onClick={() => setOpen(true)}
                >
                  Menu
                </button>
              </div>

              <Link href="/" className="justify-self-center text-center">
                <p className="text-sm uppercase tracking-[0.22em] font-bold text-amber-700">Food Ninja</p>
              </Link>

              <div className="flex items-center justify-end gap-2">
                {actions}
                {user ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-full border border-red-500/20 bg-red-500/10 px-3.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/20 transition"
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
                "fixed inset-y-0 left-0 z-40 w-80 transform p-4 transition md:static md:translate-x-0 border-r border-black/10 bg-[#fffaf2]/95 shadow-xl backdrop-blur-xl md:rounded-3xl md:border",
                open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
              )}
            >
              <div className="flex h-full flex-col gap-4">
                <div className="rounded-2xl border border-black/5 bg-panel-muted/90 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] font-bold text-amber-700">{role}</p>
                      <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                      Live
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{subtitle}</p>
                </div>

                <nav className="flex flex-1 flex-col gap-2 overflow-auto">
                  {nav.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        className={cn(
                          "rounded-2xl border px-3.5 py-3 transition",
                          isActive
                            ? "border-amber-500 bg-amber-50/80 shadow-xs ring-1 ring-amber-500/30 text-amber-950 font-bold"
                            : "border-black/5 bg-white/80 shadow-xs hover:border-amber-200 hover:bg-amber-50/50 text-slate-700"
                        )}
                        onClick={() => setOpen(false)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className={cn("text-sm", isActive ? "font-bold text-slate-900" : "font-medium text-slate-800")}>{item.label}</span>
                          <span className={cn("text-xs", isActive ? "text-amber-700 font-semibold" : "text-slate-400")}>{item.hint}</span>
                        </div>
                      </Link>
                    );
                  })}
                </nav>

                <div className="rounded-2xl border border-amber-200/60 bg-amber-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {user ? `Logged in as: ${user.username}` : "Guest session"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
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
