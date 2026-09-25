"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StatusTimeline } from "@/components/status-timeline";
import { Badge, Panel } from "@/components/ui";
import { customerNav } from "@/lib/platform";
import {
  getAuthUser,
  getOnboardingDetails,
  apiGetUserOrderDetail,
  apiGetUserOrders,
  type CustomerOrder,
} from "@/lib/backend";
import { useToast } from "@/components/toast-provider";
import { CustomerAccessGuard } from "@/components/customer-access-guard";

export default function OrderTrackingPage() {
  const params = useParams();
  const rawId = (params?.id as string) || "active";
  const { toast } = useToast();

  const [deliveryArea, setDeliveryArea] = useState<string>("Dhaka");
  const [activeOrder, setActiveOrder] = useState<CustomerOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function loadOrder() {
    try {
      if (rawId && rawId !== "active") {
        const order = await apiGetUserOrderDetail(rawId);
        setActiveOrder(order);
      } else {
        const orders = await apiGetUserOrders();
        if (Array.isArray(orders) && orders.length > 0) {
          setActiveOrder(orders[0]);
        } else {
          setActiveOrder(null);
        }
      }
    } catch {
      // Fallback: try finding in orders list
      try {
        const orders = await apiGetUserOrders();
        const found = orders.find(
          (o) => String(o.order_id).toLowerCase() === String(rawId).toLowerCase()
        );
        setActiveOrder(found || (orders.length > 0 ? orders[0] : null));
      } catch {
        setActiveOrder(null);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const user = getAuthUser();
    if (user) {
      const details = getOnboardingDetails(user.username);
      if (details?.area) {
        setDeliveryArea(String(details.area));
      }
    }
    loadOrder();
  }, [rawId]);

  async function handleRefreshStatus() {
    setIsRefreshing(true);
    await loadOrder();
    toast("Order status refreshed.", "default");
  }

  function getPhaseIndex(status?: string): number {
    if (!status) return 2;
    const s = status.toLowerCase();
    if (s === "pending") return 0;
    if (s === "preparing") return 1;
    if (s === "delivering") return 2;
    if (s === "delivered") return 3;
    return 2;
  }

  const currentPhaseIndex = activeOrder ? getPhaseIndex(activeOrder.status) : 2;

  // Timeline steps
  const timelineSteps = [
    {
      label: "Order Placed & Confirmed",
      time: "Received",
      tone: "success" as const,
    },
    {
      label: "Kitchen Prepared Food",
      time: "Ready",
      tone: "success" as const,
    },
    {
      label: "Courier Out for Delivery",
      time: currentPhaseIndex === 2 ? "In progress" : currentPhaseIndex > 2 ? "Completed" : "Pending",
      tone: currentPhaseIndex >= 2 ? ("primary" as const) : ("neutral" as const),
    },
    {
      label: "Delivered to Doorstep",
      time: currentPhaseIndex >= 3 ? "Delivered" : "Pending",
      tone: currentPhaseIndex >= 3 ? ("success" as const) : ("neutral" as const),
    },
  ];

  return (
    <CustomerAccessGuard>
      <AppShell
        role="Customer portal"
        title={activeOrder ? `Order Tracking: #${activeOrder.order_id}` : "Order Tracking"}
        subtitle="Live delivery route, courier dispatch status, and order details."
        nav={customerNav}
        actions={
          activeOrder ? (
            <Badge tone="success">
              {activeOrder.status.toUpperCase()}
            </Badge>
          ) : (
            <Badge tone="primary">Tracking Portal</Badge>
          )
        }
      >
        {isLoading ? (
          <Panel className="p-12 text-center text-sm text-slate-500">
            Checking order status...
          </Panel>
        ) : !activeOrder ? (
          <div className="space-y-6 max-w-2xl mx-auto py-8">
            <Panel className="space-y-5 p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">
                🛵
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-slate-900">No Orders Found</h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  {rawId !== "active"
                    ? `Order #${rawId} could not be located in your history.`
                    : "You do not have any pending orders currently."}
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/home"
                  className="rounded-full bg-amber-500 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition"
                >
                  Browse Restaurants →
                </Link>
              </div>
            </Panel>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
            {/* Left Column: Order Delivery Status */}
            <div className="space-y-6">
              <Panel className="space-y-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
                  <div>
                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                      Live Delivery Tracking
                    </span>
                    <h2 className="text-xl font-bold text-slate-900">
                      Order #{activeOrder.order_id}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      From: <strong className="text-slate-800">{activeOrder.restaurant_name}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white shadow-sm uppercase">
                      {activeOrder.status}
                    </span>
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Delivery Progression</h3>
                  <StatusTimeline steps={timelineSteps} />
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <span>🛵</span> Your rider is on the way
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    Your order is on the way to your address. Please keep cash ready for the courier.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-black/5">
                  <button
                    type="button"
                    onClick={handleRefreshStatus}
                    disabled={isRefreshing}
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    {isRefreshing ? "Refreshing..." : "🔄 Refresh Status"}
                  </button>

                  <Link
                    href="/home"
                    className="text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Order More Dishes →
                  </Link>
                </div>
              </Panel>
            </div>

            {/* Right Column: Order Details & Payment Method */}
            <div className="space-y-6">
              <Panel className="space-y-5 p-6">
                <div className="border-b border-black/5 pb-3">
                  <h3 className="text-base font-bold text-slate-900">Order Summary</h3>
                  <p className="text-xs text-slate-500">Placed on: {activeOrder.order_timestamp || "Today"}</p>
                </div>

                {/* Ordered Items if available */}
                {activeOrder.items && activeOrder.items.length > 0 ? (
                  <div className="space-y-2.5">
                    {activeOrder.items.map((it) => (
                      <div
                        key={it.food_id}
                        className="flex items-center justify-between rounded-xl border border-black/5 bg-slate-50 p-3 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{it.name}</p>
                          <p className="text-[11px] text-slate-500">x{it.quantity} @ ৳{it.unit_price}</p>
                        </div>
                        <span className="font-bold text-slate-900">৳{it.item_total}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Bill & Payment Info */}
                <div className="rounded-2xl border border-black/5 bg-slate-50 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Restaurant:</span>
                    <span className="font-semibold text-slate-900">{activeOrder.restaurant_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Delivery Address:</span>
                    <span className="font-semibold text-slate-900">{deliveryArea}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment:</span>
                    <span className="font-bold text-slate-900 flex items-center gap-1">
                      <span>💵</span> {activeOrder.payment_method || "Cash on delivery"}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-black/5 pt-2 text-sm font-bold">
                    <span>Total Amount:</span>
                    <span className="text-amber-700">{activeOrder.bill}</span>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        )}
      </AppShell>
    </CustomerAccessGuard>
  );
}
