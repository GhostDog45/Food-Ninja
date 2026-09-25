"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { riderNav } from "@/lib/platform";
import { apiGetRiderHistory, type RiderOrder } from "@/lib/backend";

export default function RiderHistoryPage() {
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiGetRiderHistory().then(setOrders).finally(() => setLoading(false)); }, []);
  return <AppShell role="Rider app" title="Delivered Orders" subtitle="Your completed delivery history." nav={riderNav}><Panel className="space-y-4 p-6"><SectionHeading eyebrow="Delivery history" title="Past deliveries"/><p className="text-xs text-slate-500">Completed trips: {orders.length}</p>{loading ? <p className="py-6 text-center text-sm text-slate-500">Loading history...</p> : orders.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No delivered orders yet.</p> : <div className="divide-y divide-black/5">{orders.map((order) => <div key={order.order_id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-semibold text-slate-900">{order.restaurant_name}</p><p className="text-xs text-slate-500">Order {order.order_id} · {order.final_timestamp ? new Date(order.final_timestamp).toLocaleString() : order.order_timestamp}</p></div><Badge tone="success">Delivered</Badge></div>)}</div>}</Panel></AppShell>;
}
