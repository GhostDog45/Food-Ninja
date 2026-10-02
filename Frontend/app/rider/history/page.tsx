"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { riderNav } from "@/lib/platform";
import { apiGetRiderHistory, getImageUrl, type RiderOrder } from "@/lib/backend";

export default function RiderHistoryPage() {
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetRiderHistory()
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell
      role="Rider app"
      title="Delivery History"
      subtitle="Your past completed and resolved delivery assignments."
      nav={riderNav}
    >
      <Panel className="space-y-4 p-6 sm:p-8 max-w-4xl">
        <SectionHeading eyebrow="Delivery Records" title="Trip History" />
        <p className="text-xs text-slate-500">Total recorded trips: {orders.length}</p>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading history...</p>
        ) : orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No delivered orders yet.</p>
        ) : (
          <div className="divide-y divide-black/5">
            {orders.map((order) => (
              <div key={order.order_id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-amber-100 flex items-center justify-center relative shadow-2xs">
                    {order.restaurant_picture_url ? (
                      <img
                        src={getImageUrl(order.restaurant_picture_url)}
                        alt={order.restaurant_name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-xl">🍽️</span>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{order.restaurant_name}</h4>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="font-mono">Order #{order.order_id}</span>
                      {order.customer_name && (
                        <span className="inline-flex items-center gap-1.5">
                          <span>· Customer:</span>
                          {order.customer_pfp_url ? (
                            <img
                              src={getImageUrl(order.customer_pfp_url)}
                              alt={order.customer_name}
                              className="h-4 w-4 rounded-full object-cover inline"
                            />
                          ) : (
                            <span>👤</span>
                          )}
                          <strong className="text-slate-800">{order.customer_name}</strong>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {order.final_timestamp ? new Date(order.final_timestamp).toLocaleString() : order.order_timestamp}
                    </p>
                  </div>
                </div>

                <Badge tone={order.status === "cancelled" ? "danger" : "success"}>
                  {order.status === "cancelled" ? "Cancelled" : "Delivered"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
