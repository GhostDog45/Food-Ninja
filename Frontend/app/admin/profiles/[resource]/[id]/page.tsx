"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Panel, SectionHeading } from "@/components/ui";
import { adminNav } from "@/lib/platform";
import { apiAdjustRiderAmounts, apiGetAdminProfile, getImageUrl, type AdminOrder } from "@/lib/backend";
import { useToast } from "@/components/toast-provider";

export default function AdminProfileDetailPage() {
  const params = useParams<{ resource: string; id: string }>();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [restaurants, setRestaurants] = useState<Array<{ restaurant_id: string; name: string; status: string; open_time: string; close_time: string }>>([]);
  const [duePaid, setDuePaid] = useState("");
  const [withdrawal, setWithdrawal] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    apiGetAdminProfile(params.resource, params.id)
      .then((data) => { setProfile(data.profile); setOrders(data.orders); setRestaurants(data.restaurants); })
      .catch((error) => toast(error instanceof Error ? error.message : "Failed to load profile", "danger"));
  }, [params.resource, params.id, toast]);

  async function settleRiderAmounts(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await apiAdjustRiderAmounts(params.id, Number(duePaid || 0), Number(withdrawal || 0));
      setProfile((current) => current ? { ...current, due_amount: result.due_amount, balance: result.balance } : current);
      setDuePaid("");
      setWithdrawal("");
      toast("Rider amounts updated", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update amounts", "danger");
    }
  }

  return <AppShell role="Admin panel" title="Profile details" subtitle="Password data is never displayed." nav={adminNav}>
    <div className="space-y-6">
      <Panel className="space-y-4 p-6"><SectionHeading eyebrow={params.resource} title={String(profile?.name || profile?.username || profile?.owner_id || "Loading...")} />{profile && <>{typeof profile.pfp === "string" && <Image src={getImageUrl(profile.pfp)} alt="Profile" width={96} height={96} unoptimized className="h-24 w-24 rounded-full object-cover" />}<div className="grid gap-3 sm:grid-cols-2">{Object.entries(profile).filter(([key]) => !key.toLowerCase().includes("password") && key !== "pfp" && key !== "location").map(([key, value]) => <div key={key} className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase text-slate-500">{key.replaceAll("_", " ")}</p><p className="text-sm text-slate-900">{String(value ?? "-")}</p></div>)}</div></>}</Panel>
      {params.resource === "riders" && profile && <Panel className="space-y-4 p-6"><SectionHeading eyebrow="Offline settlement" title="Rider amounts" description={`Due to website: ৳${Number(profile.due_amount || 0).toFixed(2)} · Rider balance: ৳${Number(profile.balance || 0).toFixed(2)}`} /><form onSubmit={settleRiderAmounts} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label className="space-y-1 text-xs text-slate-600">Paid by rider order amount<input min="0" max={Number(profile.due_amount || 0)} step="0.01" type="number" value={duePaid} onChange={(event) => setDuePaid(event.target.value)} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" /></label><label className="space-y-1 text-xs text-slate-600">Withdrawal amount<input min="0" max={Number(profile.balance || 0)} step="0.01" type="number" value={withdrawal} onChange={(event) => setWithdrawal(event.target.value)} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" /></label><button className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Record payment</button></form></Panel>}
      {params.resource === "owners" && <Panel className="space-y-4 p-6"><SectionHeading eyebrow="Owner portfolio" title="Restaurants" description={`${restaurants.length} restaurant${restaurants.length === 1 ? "" : "s"} linked to this owner.`} />{restaurants.length ? <div className="divide-y divide-slate-100">{restaurants.map((restaurant) => <Link key={restaurant.restaurant_id} href={`/admin/restaurants/${encodeURIComponent(restaurant.restaurant_id)}`} className="flex flex-wrap items-center justify-between gap-3 py-3 transition hover:bg-amber-50/60"><span><span className="block font-semibold text-slate-800">{restaurant.name}</span><span className="mt-1 block font-mono text-xs text-slate-500">{restaurant.restaurant_id} · {restaurant.open_time}–{restaurant.close_time}</span></span><span className="flex items-center gap-3"><span className={`text-xs font-semibold uppercase ${restaurant.status === "banned" ? "text-rose-700" : restaurant.status === "open" ? "text-emerald-700" : "text-slate-500"}`}>{restaurant.status}</span><span aria-hidden="true" className="text-slate-400">→</span></span></Link>)}</div> : <p className="border-t border-slate-100 py-5 text-sm text-slate-500">This owner has no restaurants yet.</p>}</Panel>}
      {orders.length > 0 && <Panel className="space-y-4 p-6"><SectionHeading eyebrow="Order history" title="Orders" />{orders.map((order) => <article key={order.order_id} className="border-t border-black/5 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><a href={`/admin/orders?order_id=${encodeURIComponent(order.order_id)}`} className="font-mono text-sm font-bold text-amber-700 hover:underline">{order.order_id}</a><span className="text-xs uppercase text-slate-500">{order.status} · {order.order_timestamp}</span></div><p className="mt-1 text-sm text-slate-600">{order.restaurant_name || ""} {order.rider_name ? `· Rider: ${order.rider_name}` : ""}</p><pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{order.bill}</pre></article>)}</Panel>}
    </div>
  </AppShell>;
}
