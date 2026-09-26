"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { Badge, SectionHeading, TableFrame } from "@/components/ui";
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

  const load = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    try {
      setRows(await apiGetAdminDirectory(resource, status, submittedSearch, nextOffset));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to load records", "danger");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [resource, status, submittedSearch, toast]);

  useEffect(() => {
    setOffset(0);
    setSubmittedSearch("");
  }, [resource, status]);

  useEffect(() => {
    load(0);
  }, [load]);

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

  const showEmail = resource !== "restaurants";
  const showPhone = resource !== "restaurants";

  return <AppShell role="Admin panel" title={title} subtitle={description} nav={adminNav} actions={<button type="button" aria-label="Refresh directory" title="Refresh directory" onClick={() => load(offset)} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white text-slate-600 transition hover:border-amber-400 hover:text-amber-700">↻</button>}>
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5"><SectionHeading eyebrow="Platform directory" title={title} description={description} /><p className="font-mono text-sm text-slate-500">{rows.length.toString().padStart(2, "0")} shown</p></div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">{tabs[resource].map((tab) => <button key={tab.key} type="button" onClick={() => setStatus(tab.key)} className={`rounded-md px-3 py-2 text-xs font-semibold transition ${status === tab.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{tab.label}</button>)}</div>
        <form onSubmit={submitSearch} className="flex min-w-[min(100%,360px)] flex-1 gap-2 sm:max-w-md"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${resource === "restaurants" ? "restaurant, owner, or ID" : "name, email, or phone"}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500" /><button type="submit" className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-600">Search</button></form>
      </div>
      {loading ? <p className="border-y border-slate-200 py-10 text-center text-sm text-slate-500">Loading directory…</p> : rows.length === 0 ? <p className="border-y border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No records found.</p> : <TableFrame className="rounded-xl"><table className="w-full min-w-160 text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Identity</th><th className="px-4 py-3">Name</th>{showEmail && <th className="px-4 py-3">Email</th>}{showPhone && <th className="px-4 py-3">Phone</th>}<th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100 bg-white">{rows.map((row) => { const identifier = String(row[idFields[resource]]); const href = resource === "restaurants" ? `/admin/restaurants/${encodeURIComponent(identifier)}` : `/admin/profiles/${resource}/${encodeURIComponent(identifier)}`; return <tr key={identifier} className="transition hover:bg-amber-50/40"><td className="px-4 py-3 font-mono text-xs font-semibold"><Link href={href} className="text-amber-800 hover:underline">{identifier}</Link></td><td className="px-4 py-3 font-medium text-slate-800"><Link href={href} className="hover:text-amber-800">{row.name || row.owner_name || "-"}</Link></td>{showEmail && <td className="px-4 py-3 text-slate-600">{row.email || "-"}</td>}{showPhone && <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.phone || "-"}</td>}<td className="px-4 py-3"><Badge tone={row.status === "banned" ? "danger" : row.status === "pending" ? "warning" : "success"}>{String(row.status || "active").toUpperCase()}</Badge></td><td className="px-4 py-3 text-right">{action(row)}</td></tr>; })}</tbody></table></TableFrame>}
      <div className="flex items-center justify-between border-t border-slate-200 pt-4"><button type="button" disabled={offset === 0 || loading} onClick={() => { const next = Math.max(0, offset - 25); setOffset(next); load(next); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40">Previous</button><span className="font-mono text-xs text-slate-500">{offset + 1}–{offset + rows.length}</span><button type="button" disabled={loading || rows.length < 25} onClick={() => { const next = offset + 25; setOffset(next); load(next); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40">Next</button></div>
    </div>
  </AppShell>;
}
