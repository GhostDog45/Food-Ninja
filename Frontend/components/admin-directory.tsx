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
        ? <button type="button" onClick={() => changeStatus(row, "approved")} className="rounded-full border border-slate-300 bg-white px-3.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs transition hover:bg-slate-50">Unban</button>
        : <button type="button" onClick={() => changeStatus(row, "banned")} className="rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">Ban</button>;
    }
    if (status === "pending") {
      return <div className="flex justify-end gap-2">
        <button type="button" onClick={() => changeStatus(row, "approved")} className="rounded-full bg-emerald-600 px-3.5 py-1 text-xs font-semibold text-white shadow-2xs transition hover:bg-emerald-700">Approve</button>
        <button type="button" onClick={() => changeStatus(row, resource === "owners" ? "declined" : "banned")} className="rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">Decline</button>
      </div>;
    }
    return status === "banned"
      ? <button type="button" onClick={() => changeStatus(row, "approved")} className="rounded-full border border-slate-300 bg-white px-3.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs transition hover:bg-slate-50">Unban</button>
      : <button type="button" onClick={() => changeStatus(row, "banned")} className="rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">Ban</button>;
  }

  const showEmail = resource !== "restaurants";
  const showPhone = resource !== "restaurants";

  return (
    <AppShell
      role="Admin panel"
      title={title}
      subtitle={description}
      nav={adminNav}
      actions={
        <button
          type="button"
          aria-label="Refresh directory"
          title="Refresh directory"
          onClick={() => load(offset)}
          className="grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-white text-slate-600 shadow-xs transition hover:border-amber-400 hover:text-amber-700 hover:bg-slate-50"
        >
          ↻
        </button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/5 pb-5">
          <SectionHeading eyebrow="Platform directory" title={title} description={description} />
          <span className="rounded-full border border-black/10 bg-white px-3.5 py-1 font-mono text-xs font-semibold text-slate-600 shadow-2xs">
            {rows.length.toString().padStart(2, "0")} shown
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-full border border-black/10 bg-slate-100/90 p-1 shadow-2xs">
            {tabs[resource].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatus(tab.key)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  status === tab.key
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={submitSearch} className="flex min-w-[min(100%,360px)] flex-1 gap-2 sm:max-w-md">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${resource === "restaurants" ? "restaurant, owner, or ID" : "name, email, or phone"}`}
              className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-2xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
            <button
              type="submit"
              className="rounded-full bg-amber-500 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-amber-600"
            >
              Search
            </button>
          </form>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-black/5 bg-white py-14 text-center text-sm text-slate-500 shadow-sm">
            Loading directory…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 py-16 text-center text-sm text-slate-500 shadow-sm">
            No records found.
          </div>
        ) : (
          <TableFrame className="rounded-3xl border border-black/5 bg-white shadow-sm overflow-hidden">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="border-b border-black/5 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Identity</th>
                  <th className="px-5 py-3.5">Name</th>
                  {showEmail && <th className="px-5 py-3.5">Email</th>}
                  {showPhone && <th className="px-5 py-3.5">Phone</th>}
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((row) => {
                  const identifier = String(row[idFields[resource]]);
                  const href =
                    resource === "restaurants"
                      ? `/admin/restaurants/${encodeURIComponent(identifier)}`
                      : `/admin/profiles/${resource}/${encodeURIComponent(identifier)}`;
                  return (
                    <tr key={identifier} className="transition hover:bg-amber-50/30">
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold">
                        <Link href={href} className="text-amber-800 hover:text-amber-900 hover:underline">
                          {identifier}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-900">
                        <Link href={href} className="hover:text-amber-800 transition">
                          {row.name || row.owner_name || "-"}
                        </Link>
                      </td>
                      {showEmail && <td className="px-5 py-3.5 text-slate-600">{row.email || "-"}</td>}
                      {showPhone && <td className="px-5 py-3.5 font-mono text-xs text-slate-600">{row.phone || "-"}</td>}
                      <td className="px-5 py-3.5">
                        <Badge tone={row.status === "banned" ? "danger" : row.status === "pending" ? "warning" : "success"}>
                          {String(row.status || "active").toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">{action(row)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableFrame>
        )}

        <div className="flex items-center justify-between border-t border-black/5 pt-4">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => {
              const next = Math.max(0, offset - 25);
              setOffset(next);
              load(next);
            }}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="font-mono text-xs font-medium text-slate-500">
            {offset + 1}–{offset + rows.length}
          </span>
          <button
            type="button"
            disabled={loading || rows.length < 25}
            onClick={() => {
              const next = offset + 25;
              setOffset(next);
              load(next);
            }}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </AppShell>
  );
}
