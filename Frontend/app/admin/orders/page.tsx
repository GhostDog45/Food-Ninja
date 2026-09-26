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
  return (
    <AppShell
      role="Admin panel"
      title="Search order"
      subtitle="Look up an order by its ID and review its bill."
      nav={adminNav}
    >
      <Panel className="space-y-6 p-6 sm:p-8">
        <SectionHeading eyebrow="Order support" title="Order lookup" />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void searchOrder();
          }}
          className="flex flex-wrap gap-2.5"
        >
          <input
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            placeholder="Enter Order ID"
            className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-2xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
          <button
            disabled={loading}
            className="rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-amber-600 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {order && (
          <section className="space-y-5 border-t border-black/5 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-base font-bold text-slate-900">{order.order_id}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {order.restaurant_name} · {order.order_timestamp}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <Badge
                  tone={
                    order.status === "delivered"
                      ? "success"
                      : order.status === "cancelled" || order.status === "rejected"
                      ? "danger"
                      : "warning"
                  }
                >
                  {order.status}
                </Badge>
                {cancellable && (
                  <button
                    type="button"
                    onClick={() => void cancelOrder()}
                    className="rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Cancel order
                  </button>
                )}
              </div>
            </div>

            <dl className="grid gap-3 rounded-2xl border border-black/5 bg-slate-50/70 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{order.customer_name} ({order.username})</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rider</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{order.rider_name || "Pending Assignment"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{order.payment_method} · {order.payment_status}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Delivery location</dt>
                <dd className="mt-0.5 font-mono text-xs text-slate-700">{order.latitude}, {order.longitude}</dd>
              </div>
            </dl>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Invoice / Bill Details</p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-black/5 bg-slate-50/90 p-4 font-mono text-xs leading-5 text-slate-800 shadow-2xs">
                {order.bill}
              </pre>
            </div>
          </section>
        )}
      </Panel>
    </AppShell>
  );
}