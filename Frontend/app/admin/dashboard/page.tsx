"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Panel, StatCard } from "@/components/ui";
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

  return <AppShell role="Admin Portal" title="Admin Dashboard" subtitle="Account and restaurant status summary." nav={adminNav} actions={<button type="button" onClick={loadSummary} className="rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-semibold">Refresh Summary</button>}>
    <Panel className="p-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([key, label]) => <StatCard key={key} label={label} value={loading ? "..." : String(summary[key] ?? 0)} delta="Current database count" />)}
      </div>
    </Panel>
  </AppShell>;
}
