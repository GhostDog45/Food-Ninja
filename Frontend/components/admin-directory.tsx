"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { Badge, Panel, SectionHeading, TableFrame } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { adminNav } from "@/lib/platform";
import {
  apiGetAdminDirectory,
  apiSetAdminDirectoryStatus,
  type AdminDirectoryResource,
  type AdminDirectoryStatus,
} from "@/lib/backend";

type Props = { resource: AdminDirectoryResource; title: string; description: string };
type Row = Record<string, any>;

const tabs: Record<AdminDirectoryResource, { key: AdminDirectoryStatus; label: string }[]> = {
  admins: [{ key: "pending", label: "Pending" }, { key: "approved", label: "Approved" }, { key: "banned", label: "Banned" }],
  owners: [{ key: "pending", label: "Pending" }, { key: "approved", label: "Approved" }, { key: "banned", label: "Banned" }],
  restaurants: [{ key: "pending", label: "Pending" }, { key: "approved", label: "Approved" }, { key: "banned", label: "Banned" }],
  riders: [{ key: "pending", label: "Pending" }, { key: "approved", label: "Approved" }, { key: "banned", label: "Banned" }],
  users: [{ key: "active", label: "Users" }, { key: "banned", label: "Banned Users" }],
};

const idFields: Record<AdminDirectoryResource, string> = {
  admins: "username",
  owners: "owner_id",
  restaurants: "restaurant_id",
  riders: "username",
  users: "username",
};

export function AdminDirectory({ resource, title, description }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<AdminDirectoryStatus>(tabs[resource][0].key);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function load(nextOffset = offset) {
    setLoading(true);
    try {
      setRows(await apiGetAdminDirectory(resource, status, submittedSearch, nextOffset));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to load records", "danger");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setOffset(0);
    setSubmittedSearch("");
  }, [resource, status]);

  useEffect(() => {
    load(0);
  }, [resource, status, submittedSearch]);

  async function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setOffset(0);
    setSubmittedSearch(search.trim());
  }

  async function changeStatus(row: Row, nextStatus: string) {
    const identifier = String(row[idFields[resource]]);
    setActionLoading(identifier);
    try {
      let databaseStatus = nextStatus;
      if (resource === "riders" && nextStatus === "approved") databaseStatus = "offline";
      if (resource === "restaurants" && nextStatus === "approved") databaseStatus = "closed";
      if (resource === "users" && nextStatus === "approved") databaseStatus = "ok";
      if (resource === "owners" && nextStatus === "declined") databaseStatus = "rejected";
      await apiSetAdminDirectoryStatus(resource, identifier, databaseStatus);
      toast(`${title} status updated.`, "success");
      await load(offset);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Status update failed", "danger");
    } finally {
      setActionLoading(null);
    }
  }

  function action(row: Row) {
    const identifier = String(row[idFields[resource]]);
    if (actionLoading === identifier) return <span className="text-slate-400">Updating...</span>;
    if (resource === "users") {
      return row.status === "banned"
        ? <button type="button" onClick={() => changeStatus(row, "approved")} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Unban</button>
        : <button type="button" onClick={() => changeStatus(row, "banned")} className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white">Ban</button>;
    }
    if (status === "pending") {
      return <div className="flex justify-end gap-2">
        <button type="button" onClick={() => changeStatus(row, "approved")} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">Approve</button>
        <button type="button" onClick={() => changeStatus(row, resource === "owners" ? "declined" : "banned")} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">Decline</button>
      </div>;
    }
    return status === "banned"
      ? <button type="button" onClick={() => changeStatus(row, "approved")} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Unban</button>
      : <button type="button" onClick={() => changeStatus(row, "banned")} className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white">Ban</button>;
  }

  return <AppShell role="Admin panel" title={title} subtitle={description} nav={adminNav} actions={<button type="button" onClick={() => load(offset)} className="rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-semibold">Refresh</button>}>
    <Panel className="space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><SectionHeading eyebrow="Administration" title={title} description={description} /><Badge tone="primary">{rows.length} records</Badge></div>
      <div className="flex flex-wrap gap-2">{tabs[resource].map((tab) => <button key={tab.key} type="button" onClick={() => setStatus(tab.key)} className={`rounded-full px-4 py-2 text-xs font-semibold ${status === tab.key ? "bg-slate-900 text-white" : "border border-black/10 bg-white text-slate-600"}`}>{tab.label}</button>)}</div>
      <form onSubmit={submitSearch} className="flex gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username, email, or phone" className="min-w-0 flex-1 rounded-full border border-black/10 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-amber-500" /><button type="submit" className="rounded-full bg-amber-500 px-5 py-2 text-xs font-bold text-white">Search</button></form>
      {loading ? <p className="py-8 text-center text-xs text-slate-500">Loading records...</p> : rows.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">No records found.</p> : <TableFrame><table className="w-full text-left text-xs"><thead className="border-b border-black/5 bg-slate-50"><tr><th className="px-4 py-3">Identity</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-black/5">{rows.map((row) => { const identifier = String(row[idFields[resource]]); const href = resource === "restaurants" ? `/admin/restaurants/${encodeURIComponent(identifier)}` : `/admin/profiles/${resource}/${encodeURIComponent(identifier)}`; return <tr key={identifier}><td className="px-4 py-3 font-mono font-bold"><Link href={href} className="text-amber-700 hover:underline">{identifier}</Link></td><td className="px-4 py-3"><Link href={href} className="hover:underline">{row.name || row.owner_name || "-"}</Link></td><td className="px-4 py-3 text-slate-600">{row.email || "-"}</td><td className="px-4 py-3 font-mono text-slate-600">{row.phone || "-"}</td><td className="px-4 py-3"><Badge tone={row.status === "banned" ? "danger" : row.status === "pending" ? "warning" : "success"}>{String(row.status || "active").toUpperCase()}</Badge></td><td className="px-4 py-3 text-right">{action(row)}</td></tr>; })}</tbody></table></TableFrame>}
      <div className="flex items-center justify-between border-t border-black/5 pt-4"><button type="button" disabled={offset === 0 || loading} onClick={() => { const next = Math.max(0, offset - 25); setOffset(next); load(next); }} className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold disabled:opacity-40">Previous 25</button><span className="text-xs text-slate-500">Rows {offset + 1}-{offset + rows.length}</span><button type="button" disabled={loading || rows.length < 25} onClick={() => { const next = offset + 25; setOffset(next); load(next); }} className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold disabled:opacity-40">Next 25</button></div>
    </Panel>
  </AppShell>;
}
