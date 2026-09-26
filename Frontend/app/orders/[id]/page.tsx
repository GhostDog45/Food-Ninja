"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { customerNav } from "@/lib/platform";
import { apiGetUserOrderDetail, type CustomerOrder } from "@/lib/backend";
import { CustomerAccessGuard } from "@/components/customer-access-guard";
import { OrderLiveTrackingMap } from "@/components/order-live-tracking-map";

export default function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshOrder = () => {
    const rawId = params?.id;
    if (!rawId) return;
    apiGetUserOrderDetail(rawId)
      .then((data) => setOrder(data))
      .catch(() => {});
  };

  useEffect(() => {
    const rawId = params?.id;
    if (!rawId) return;

    setLoading(true);
    setError("");

    apiGetUserOrderDetail(rawId)
      .then((data) => {
        setOrder(data);
      })
      .catch((reason) => {
        const msg = reason instanceof Error ? reason.message : "Could not load order details.";
        setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [params?.id]);

  const active = order?.status === "pending" || order?.status === "delivering";
  const phase = order?.status === "delivered" ? 3 : order?.status === "delivering" ? 2 : 1;

  return (
    <CustomerAccessGuard>
      <AppShell
        role="Customer portal"
        title="Live Order Tracking"
        subtitle="Track delivery progress and inspect official receipt details."
        nav={customerNav}
      >
        {loading ? (
          <Panel className="p-12 text-center space-y-3 max-w-lg mx-auto">
            <div className="text-3xl animate-spin">⏳</div>
            <p className="text-sm font-semibold text-slate-700">Loading order details...</p>
            <p className="text-xs text-slate-400">Fetching live status from dispatch...</p>
          </Panel>
        ) : !order ? (
          <Panel className="p-10 text-center space-y-4 max-w-md mx-auto">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-amber-100 text-2xl text-amber-700">
              📦
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Order Not Found</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {error || "We could not find an active or completed order matching this reference."}
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              <Link
                href="/orders"
                className="w-full sm:w-auto rounded-full bg-amber-500 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-600 transition"
              >
                ← View Order History
              </Link>
              <Link
                href="/home"
                className="w-full sm:w-auto rounded-full border border-black/10 bg-white px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Browse Restaurants
              </Link>
            </div>
          </Panel>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            <Panel className="space-y-6 p-6 sm:p-8">
              {/* Order Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/5 pb-4">
                <div>
                  <SectionHeading eyebrow={`Order ${order.order_id}`} title={order.restaurant_name} />
                  <p className="text-xs text-slate-500 mt-1">
                    Placed on {order.order_timestamp ? new Date(order.order_timestamp).toLocaleString() : "Recently"}
                  </p>
                </div>
                <div>
                  <Badge
                    tone={
                      order.status === "delivered"
                        ? "success"
                        : order.status === "rejected" || order.status === "cancelled"
                        ? "danger"
                        : "warning"
                    }
                  >
                    {order.status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              {/* Status Notice if Rejected */}
              {order.status === "rejected" && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 space-y-1">
                  <p className="font-bold">⚠️ Order Declined</p>
                  <p>The restaurant was unable to accept or prepare this order. No charges were deducted.</p>
                </div>
              )}

              {/* Progress Steps for Active / Delivered Orders */}
              {(active || order.status === "delivered") && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Live Delivery Progress</p>
                  <ol className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "1. Order Confirmed", desc: "Sent to kitchen" },
                      { label: "2. Picked up by Rider", desc: "Out for delivery" },
                      { label: "3. Order Delivered", desc: "Arrived at location" },
                    ].map((step, index) => {
                      const isDone = index <= phase - 1;
                      return (
                        <li
                          key={step.label}
                          className={`rounded-2xl border p-3 text-xs transition ${
                            isDone
                              ? "border-emerald-300 bg-emerald-50 text-emerald-950 font-semibold shadow-2xs"
                              : "border-black/5 bg-slate-50 text-slate-400"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{isDone ? "✓" : "○"}</span>
                            <span>{step.label}</span>
                          </div>
                          <p className="text-[11px] font-normal text-slate-500 mt-0.5">{step.desc}</p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              {/* Realtime OSM Live Delivery Tracking Map */}
              {(active || order.status === "delivered") && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Live Delivery Route (OpenStreetMap)
                  </p>
                  <OrderLiveTrackingMap
                    orderId={order.order_id}
                    orderStatus={order.status}
                    customerLat={order.latitude}
                    customerLng={order.longitude}
                    restaurantLat={order.restaurant_latitude}
                    restaurantLng={order.restaurant_longitude}
                    restaurantName={order.restaurant_name}
                    riderName={order.rider_name}
                    riderPhone={order.rider_phone}
                    riderVehicle={order.rider_vehicle}
                    onStatusChange={(newStatus) => {
                      if (newStatus !== order.status) {
                        refreshOrder();
                      }
                    }}
                  />
                </div>
              )}

              {/* Bill Details */}
              <div className="rounded-2xl border border-black/5 bg-slate-50 p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between border-b border-black/5 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Official Receipt</span>
                  <span className="text-xs text-slate-500 font-mono">OD: {order.order_id}</span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 leading-relaxed">
                  {order.bill}
                </pre>
              </div>

              {/* Navigation Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-black/5">
                <Link
                  href="/orders"
                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline"
                >
                  ← All Orders & Receipts
                </Link>
                <Link
                  href="/home"
                  className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
                >
                  Explore More Restaurants →
                </Link>
              </div>
            </Panel>
          </div>
        )}
      </AppShell>
    </CustomerAccessGuard>
  );
}
