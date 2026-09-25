"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { customerNav } from "@/lib/platform";
import { apiGetUserOrderDetail, type CustomerOrder } from "@/lib/backend";
import { CustomerAccessGuard } from "@/components/customer-access-guard";

export default function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGetUserOrderDetail(params.id).then(setOrder).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load order")).finally(() => setLoading(false));
  }, [params.id]);

  const active = order?.status === "pending" || order?.status === "delivering";
  const phase = order?.status === "delivered" ? 3 : order?.status === "delivering" ? 2 : 1;
  return <CustomerAccessGuard><AppShell role="Customer portal" title="Order status" subtitle="Order progress and receipt details." nav={customerNav}>
    {loading ? <Panel className="p-10 text-center">Loading order...</Panel> : !order ? <Panel className="p-10 text-center text-rose-700">{error || "Order not found"}</Panel> : <div className="mx-auto max-w-3xl space-y-5"><Panel className="space-y-4 p-6"><div className="flex items-center justify-between"><SectionHeading eyebrow={`Order ${order.order_id}`} title={order.restaurant_name} /><Badge tone={order.status === "delivered" ? "success" : order.status === "rejected" || order.status === "cancelled" ? "danger" : "warning"}>{order.status}</Badge></div><p className="text-sm text-slate-500">Placed {order.order_timestamp ? new Date(order.order_timestamp).toLocaleString() : "recently"}</p>{order.status === "rejected" && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">Sorry, the restaurant closed or, due to unfortunate events, failed to prepare the food.</p>}{active && <ol className="grid gap-3 sm:grid-cols-3">{["Order pending", "Received from restaurant", "Delivered"].map((step, index) => <li key={step} className={`rounded-xl border p-3 text-sm ${index <= phase - 1 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-black/10 bg-white text-slate-500"}`}>{step}</li>)}</ol>}<div className="border-t pt-4"><p className="font-semibold">Bill</p><pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{order.bill}</pre></div><div className="flex gap-3"><Link href="/orders" className="text-sm font-semibold text-amber-700 hover:underline">Order history</Link><Link href="/home" className="text-sm font-semibold text-amber-700 hover:underline">Browse restaurants</Link></div></Panel></div>}
  </AppShell></CustomerAccessGuard>;
}
