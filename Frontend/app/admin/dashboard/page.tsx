"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { SectionHeading } from "@/components/ui";
import { adminNav } from "@/lib/platform";
import { apiGetAdminSummary, type AdminSummary } from "@/lib/backend";

const metrics = [
  ["pending_admins", "Pending admins"],
  ["approved_admins", "Approved admins"],
  ["banned_admins", "Banned admins"],
  ["pending_riders", "Pending riders"],
  ["approved_riders", "Approved riders"],
  ["banned_riders", "Banned riders"],
  ["pending_owners", "Pending restaurant owners"],
  ["approved_owners", "Approved restaurant owners"],
  ["banned_owners", "Banned restaurant owners"],
  ["pending_restaurants", "Pending restaurants"],
  ["approved_restaurants", "Approved restaurants"],
  ["banned_restaurants", "Banned restaurants"],
  ["active_users", "Users"],
  ["banned_users", "Banned users"],
] as const;

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<AdminSummary>({});
  const [loading, setLoading] = useState(true);

  async function loadSummary() {
    setLoading(true);
    try { setSummary(await apiGetAdminSummary()); }
    catch { setSummary({}); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadSummary(); }, []);

  const metricGroups = [
    { title: "Accounts", items: metrics.slice(0, 3).concat(metrics.slice(12)) },
    { title: "Delivery fleet", items: metrics.slice(3, 6) },
    { title: "Restaurant partners", items: metrics.slice(6, 12) },
  ];

  return (
    <AppShell
      role="Admin operations"
      title="Overview"
      subtitle="Platform health and account approvals."
      nav={adminNav}
      actions={
        <button
          type="button"
          onClick={loadSummary}
          aria-label="Refresh summary"
          title="Refresh summary"
          className="grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-white text-slate-600 shadow-xs transition hover:border-amber-400 hover:text-amber-700 hover:bg-slate-50"
        >
          ↻
        </button>
      }
    >
      <div className="space-y-8">
        <section className="flex flex-wrap items-end justify-between gap-4 border-b border-black/5 pb-5">
          <SectionHeading
            eyebrow="Platform control"
            title="Operations overview"
            description="Current account, fleet, and restaurant status across Dhaka."
          />
          <div className="flex flex-wrap gap-2.5">
            {[
              ["/admin/orders", "Find an order"],
              ["/admin/categories", "Manage categories"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-amber-600"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>

        {metricGroups.map((group) => (
          <section key={group.title} className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {group.title}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {group.items.map(([key, label]) => (
                <div
                  key={key}
                  className="rounded-2xl border border-black/5 bg-white p-5 shadow-xs transition hover:border-amber-300 hover:bg-amber-50/20"
                >
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-slate-900">
                    {loading ? "–" : String(summary[key] ?? 0)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
