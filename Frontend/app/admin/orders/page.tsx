"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { adminNav } from "@/lib/platform";
import { apiCancelAdminOrder, apiGetAdminOrder, type AdminOrderDetail } from "@/lib/backend";

export default function AdminOrderSearchPage() {
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("order_id");
    if (requestedId) {
      setOrderId(requestedId);
      setLoading(true);
      apiGetAdminOrder(requestedId)
        .then((data) => setOrder(data.order))
        .catch((error) => toast(error instanceof Error ? error.message : "Order lookup failed", "warning"))
        .finally(() => setLoading(false));
    }
  }, [toast]);

  async function searchOrder(id = orderId) {
    const query = id.trim();
    if (!query) return;
    setLoading(true);
    try {
      const data = await apiGetAdminOrder(query);
      setOrder(data.order);
      setOrderId(query);
    } catch (error) {
      setOrder(null);
      toast(error instanceof Error ? error.message : "Order lookup failed", "warning");
    } finally {
      setLoading(false);
    }
  }

  async function cancelOrder() {
    if (!order) return;
    try {
      await apiCancelAdminOrder(order.order_id);
      const data = await apiGetAdminOrder(order.order_id);
      setOrder(data.order);
      toast("Order cancelled", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not cancel order", "danger");
    }
  }

  const cancellable = order?.status === "pending" || order?.status === "delivering";
  return <AppShell role="Admin panel" title="Search order" subtitle="Look up an order by its ID and review its bill." nav={adminNav}>
    <Panel className="space-y-5 p-6">
      <SectionHeading eyebrow="Order support" title="Order lookup" />
      <form onSubmit={(event) => { event.preventDefault(); void searchOrder(); }} className="flex flex-wrap gap-2">
        <input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="Order ID" className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm" />
        <button disabled={loading} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Searching..." : "Search"}</button>
      </form>
      {order && <section className="space-y-4 border-t border-black/5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-sm font-bold">{order.order_id}</p><p className="mt-1 text-sm text-slate-600">{order.restaurant_name} · {order.order_timestamp}</p></div><div className="flex items-center gap-3"><Badge tone={order.status === "delivered" ? "success" : order.status === "cancelled" || order.status === "rejected" ? "danger" : "warning"}>{order.status}</Badge>{cancellable && <button type="button" onClick={() => void cancelOrder()} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Cancel order</button>}</div></div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs uppercase text-slate-500">Customer</dt><dd>{order.customer_name} ({order.username})</dd></div><div><dt className="text-xs uppercase text-slate-500">Rider</dt><dd>{order.rider_name || "Pending Assignment"}</dd></div><div><dt className="text-xs uppercase text-slate-500">Payment</dt><dd>{order.payment_method} · {order.payment_status}</dd></div><div><dt className="text-xs uppercase text-slate-500">Delivery location</dt><dd>{order.latitude}, {order.longitude}</dd></div></dl>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-black/5 bg-slate-50 p-4 text-xs leading-5 text-slate-700">{order.bill}</pre>
      </section>}
    </Panel>
  </AppShell>;
}