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
  apiConfirmOrderPickup,
  apiCompleteOrder,
  type CustomerOrder,
} from "@/lib/backend";
import { useToast } from "@/components/toast-provider";
import { CustomerAccessGuard } from "@/components/customer-access-guard";

function extractSumTotal(bill?: string): string {
  if (!bill) return "0";
  const match = bill.match(/Sum total\s*=\s*([0-9.]+)/i);
  if (match) return match[1];
  const trimmed = bill.trim();
  if (/^[0-9.]+$/.test(trimmed)) return trimmed;
  const match2 = bill.match(/Total\s*=\s*([0-9.]+)/i);
  if (match2) return match2[1];
  return bill;
}

export default function OrderTrackingPage() {
  const params = useParams();
  const rawId = (params?.id as string) || "active";
  const { toast } = useToast();

  const [deliveryArea, setDeliveryArea] = useState<string>("Dhaka");
  const [activeOrder, setActiveOrder] = useState<CustomerOrder | null>(null);
  const [pendingOrders, setPendingOrders] = useState<CustomerOrder[]>([]);
  const [completedOrderNotice, setCompletedOrderNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConfirmingPickup, setIsConfirmingPickup] = useState(false);
  const [isCompletingOrder, setIsCompletingOrder] = useState(false);

  const isPendingStatus = (status?: string) => {
    if (!status) return false;
    const s = status.toLowerCase();
    return s === "pending" || s === "preparing" || s === "delivering";
  };

  async function loadOrder() {
    setCompletedOrderNotice(null);
    try {
      if (rawId && rawId !== "active") {
        const order = await apiGetUserOrderDetail(rawId);
        if (order && isPendingStatus(order.status)) {
          setActiveOrder(order);
        } else {
          setActiveOrder(null);
          setCompletedOrderNotice(order?.order_id || rawId);
        }
      } else {
        const orders = await apiGetUserOrders();
        const activeList = (orders || []).filter((o) => isPendingStatus(o.status));
        setPendingOrders(activeList);
        if (activeList.length > 0) {
          setActiveOrder(activeList[0]);
        } else {
          setActiveOrder(null);
        }
      }
    } catch {
      // Fallback: try finding in orders list
      try {
        const orders = await apiGetUserOrders();
        const activeList = (orders || []).filter((o) => isPendingStatus(o.status));
        setPendingOrders(activeList);
        if (rawId && rawId !== "active") {
          const found = activeList.find(
            (o) => String(o.order_id).toLowerCase() === String(rawId).toLowerCase()
          );
          if (found) {
            setActiveOrder(found);
          } else {
            setActiveOrder(null);
            const pastOrder = (orders || []).find(
              (o) => String(o.order_id).toLowerCase() === String(rawId).toLowerCase()
            );
            if (pastOrder) {
              setCompletedOrderNotice(pastOrder.order_id);
            }
          }
        } else {
          setActiveOrder(activeList.length > 0 ? activeList[0] : null);
        }
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

  async function handleConfirmPickup() {
    if (!activeOrder) return;
    setIsConfirmingPickup(true);
    try {
      await apiConfirmOrderPickup(activeOrder.order_id);
      toast("Courier confirmed food pickup! Out for delivery now.", "success");
      await loadOrder();
    } catch (err: any) {
      toast(err.message || "Failed to confirm pickup.", "danger");
    } finally {
      setIsConfirmingPickup(false);
    }
  }

  async function handleConfirmDelivered() {
    if (!activeOrder) return;
    setIsCompletingOrder(true);
    const deliveredId = activeOrder.order_id;
    try {
      await apiCompleteOrder(deliveredId);
      toast("Order marked as delivered! View bill & reviews in Order History.", "success");
      setCompletedOrderNotice(deliveredId);
      setActiveOrder(null);
      await loadOrder();
    } catch (err: any) {
      toast(err.message || "Failed to mark as delivered.", "danger");
    } finally {
      setIsCompletingOrder(false);
    }
  }

  function getPhaseIndex(status?: string): number {
    if (!status) return 1;
    const s = status.toLowerCase();
    if (s === "pending") return 0;
    if (s === "preparing") return 1;
    if (s === "delivering") return 2;
    if (s === "delivered") return 3;
    return 1;
  }

  const currentPhaseIndex = activeOrder ? getPhaseIndex(activeOrder.status) : 1;

  // Timeline steps: strictly reflect verified real-world lifecycle phases
  const timelineSteps = [
    {
      label: "Order Placed & Confirmed",
      time: "Received",
      tone: "success" as const,
    },
    {
      label: currentPhaseIndex >= 2 ? "Kitchen Prepared Food" : "Kitchen Preparing Food",
      time: currentPhaseIndex >= 2 ? "Picked Up" : currentPhaseIndex === 1 ? "Preparing" : "Pending",
      tone: currentPhaseIndex >= 2 ? ("success" as const) : currentPhaseIndex === 1 ? ("warning" as const) : ("neutral" as const),
    },
    {
      label: "Courier Out for Delivery",
      time: currentPhaseIndex >= 3 ? "Completed" : currentPhaseIndex === 2 ? "On the way" : "Awaiting Pickup",
      tone: currentPhaseIndex >= 3 ? ("success" as const) : currentPhaseIndex === 2 ? ("warning" as const) : ("neutral" as const),
    },
    {
      label: "Delivered to Doorstep",
      time: currentPhaseIndex >= 3 ? "Delivered" : "Estimated",
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
                {completedOrderNotice ? "✅" : "🛵"}
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-slate-900">
                  {completedOrderNotice ? "Order Already Delivered" : "No Active Orders"}
                </h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  {completedOrderNotice
                    ? `Order #${completedOrderNotice} has already been completed and delivered! Track Order displays only pending and active deliveries.`
                    : "You do not have any pending orders currently in progress. All completed deliveries, receipts, and reviews are located in Order History."}
                </p>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/orders"
                  className="rounded-full bg-slate-900 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                >
                  View Order History →
                </Link>
                <Link
                  href="/home"
                  className="rounded-full border border-black/10 bg-white px-6 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Browse Restaurants
                </Link>
              </div>
            </Panel>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Multiple Active Deliveries Switcher */}
            {pendingOrders.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/5 bg-white p-3.5 shadow-2xs text-xs">
                <span className="font-bold text-slate-500 mr-1">
                  Active Deliveries ({pendingOrders.length}):
                </span>
                {pendingOrders.map((po) => (
                  <button
                    key={po.order_id}
                    type="button"
                    onClick={() => setActiveOrder(po)}
                    className={`rounded-full px-3.5 py-1 font-semibold transition ${
                      activeOrder?.order_id === po.order_id
                        ? "bg-amber-500 text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    🛵 {po.restaurant_name} (#{po.order_id})
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
              {/* Left Column: Order Delivery Status */}
              <div className="space-y-6">
              <Panel className="space-y-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
                  <div>
                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                      {activeOrder.status === "delivered" ? "Delivered Order Summary" : "Live Delivery Tracking"}
                    </span>
                    <h2 className="text-xl font-bold text-slate-900">
                      Order #{activeOrder.order_id}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      From: <strong className="text-slate-800">{activeOrder.restaurant_name}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeOrder.status !== "delivered" && activeOrder.status !== "cancelled" ? (
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                    ) : (
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600"></span>
                    )}
                    <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white shadow-sm uppercase">
                      {activeOrder.status}
                    </span>
                  </div>
                </div>

                {/* Live Estimated Delivery Time Banner */}
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                        Estimated Delivery Time
                      </span>
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5 mt-0.5">
                        <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
                          {activeOrder.delivery_estimate?.delivery_time_range ||
                            (activeOrder.delivery_estimate?.estimated_delivery_mins
                              ? `${activeOrder.delivery_estimate.estimated_delivery_mins} mins`
                              : "25 - 35 mins")}
                        </h3>
                        {activeOrder.delivery_estimate?.estimated_arrival_time && (
                          <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                            (Arriving ~{activeOrder.delivery_estimate.estimated_arrival_time})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Traffic condition status */}
                    <div className="self-start sm:self-auto shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-xs border ${
                          activeOrder.delivery_estimate?.traffic_jam_detected
                            ? "border-amber-300 bg-amber-100 text-amber-900"
                            : "border-emerald-300 bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        <span>{activeOrder.delivery_estimate?.traffic_jam_detected ? "🚦" : "🟢"}</span>
                        <span>
                          {activeOrder.delivery_estimate?.traffic_condition || "Normal traffic flow"}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Real-time Factors Breakdown Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-amber-200/60 text-xs">
                    {/* Distance Factor */}
                    <div className="rounded-xl border border-black/5 bg-white/90 p-2.5 flex flex-col justify-between min-w-0">
                      <span className="text-[11px] text-slate-500 font-medium truncate">GPS Distance</span>
                      <p className="font-bold text-slate-900 flex items-center gap-1.5 mt-1 text-xs whitespace-nowrap">
                        <span className="shrink-0">📍</span>
                        <span>
                          {activeOrder.delivery_estimate?.distance_km ??
                            (activeOrder.distance_km ||
                              (activeOrder.distance_meters
                                ? (activeOrder.distance_meters / 1000).toFixed(2)
                                : "2.4"))}{" "}
                          km
                        </span>
                      </p>
                    </div>

                    {/* Vehicle Factor */}
                    <div className="rounded-xl border border-black/5 bg-white/90 p-2.5 flex flex-col justify-between min-w-0">
                      <span className="text-[11px] text-slate-500 font-medium truncate">Delivery By</span>
                      <p className="font-bold text-slate-900 flex items-center gap-1.5 mt-1 text-xs whitespace-nowrap">
                        <span className="shrink-0">
                          {activeOrder.rider_vehicle === "bicycle" ||
                          activeOrder.delivery_estimate?.vehicle === "bicycle"
                            ? "🚲"
                            : "🛵"}
                        </span>
                        <span className="truncate">
                          {activeOrder.rider_vehicle === "bicycle" ||
                          activeOrder.delivery_estimate?.vehicle === "bicycle"
                            ? "Bicycle"
                            : "Motorbike"}
                        </span>
                      </p>
                    </div>

                    {/* Traffic Factor */}
                    <div className="rounded-xl border border-black/5 bg-white/90 p-2.5 flex flex-col justify-between min-w-0">
                      <span className="text-[11px] text-slate-500 font-medium truncate">Traffic Impact</span>
                      <p className="font-bold text-slate-900 flex items-center gap-1.5 mt-1 text-xs whitespace-nowrap">
                        <span className="shrink-0">{activeOrder.delivery_estimate?.traffic_jam_detected ? "🚦" : "🟢"}</span>
                        <span className="truncate">
                          {activeOrder.delivery_estimate?.traffic_jam_detected
                            ? `+${activeOrder.delivery_estimate.traffic_delay_mins || 6}m Delay`
                            : "Smooth roads"}
                        </span>
                      </p>
                    </div>

                    {/* Food Prep Factor */}
                    <div className="rounded-xl border border-black/5 bg-white/90 p-2.5 flex flex-col justify-between min-w-0">
                      <span className="text-[11px] text-slate-500 font-medium truncate">Kitchen Prep</span>
                      <p className="font-bold text-slate-900 flex items-center gap-1.5 mt-1 text-xs whitespace-nowrap">
                        <span className="shrink-0">🍳</span>
                        <span>~{activeOrder.delivery_estimate?.kitchen_prep_mins || 12} mins</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Delivery Progression</h3>
                  <StatusTimeline steps={timelineSteps} />
                </div>

                {/* Courier info & phase action card */}
                {activeOrder.status === "preparing" ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🍳</span>
                        <div>
                          <p className="font-bold text-sm text-amber-950">Kitchen is Preparing Your Food</p>
                          <p className="text-[11px] text-amber-800">
                            Dishes are being cooked. Rider will arrive at the restaurant and confirm pickup before starting delivery.
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase shrink-0">
                        In Kitchen
                      </span>
                    </div>

                    <div className="pt-2 border-t border-amber-200/70 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-amber-800">
                        {activeOrder.rider_name
                          ? `Assigned Rider: ${activeOrder.rider_name}`
                          : "Awaiting courier arrival at kitchen"}
                      </span>
                      <button
                        type="button"
                        onClick={handleConfirmPickup}
                        disabled={isConfirmingPickup}
                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-600 transition disabled:opacity-50"
                      >
                        <span>{isConfirmingPickup ? "Confirming..." : "🛵 Rider: Confirm Food Pickup"}</span>
                      </button>
                    </div>
                  </div>
                ) : activeOrder.rider_name ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold flex items-center gap-1.5 text-sm">
                        <span>{activeOrder.rider_vehicle === "bicycle" ? "🚲" : "🛵"}</span>
                        <span>{activeOrder.rider_name} confirmed pickup</span>
                      </p>
                      <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase shrink-0">
                        {activeOrder.status === "delivered" ? "Delivered" : "Out for Delivery"}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800">
                      {activeOrder.status === "delivered"
                        ? "Order has been safely delivered to your doorstep. Enjoy your meal!"
                        : "Your courier has picked up the food from the kitchen and is on the way. Please have cash ready."}
                      {activeOrder.rider_phone && (
                        <span className="ml-2 font-semibold">📞 Contact rider: {activeOrder.rider_phone}</span>
                      )}
                    </p>
                    {activeOrder.status === "delivering" && (
                      <div className="pt-2 border-t border-emerald-200 flex justify-end">
                        <button
                          type="button"
                          onClick={handleConfirmDelivered}
                          disabled={isCompletingOrder}
                          className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                          {isCompletingOrder ? "Updating..." : "✓ Confirm Food Received"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="font-bold flex items-center gap-1.5 text-sm">
                        <span>🛵</span>
                        <span>Awaiting Courier Pickup</span>
                      </p>
                      <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase">
                        Pending Pickup
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Your meal is being prepared. Nearby couriers are arriving to pick up your order.
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-black/5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRefreshStatus}
                      disabled={isRefreshing}
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                    >
                      {isRefreshing ? "Refreshing..." : "🔄 Refresh Status"}
                    </button>
                    {activeOrder.status === "delivered" && (
                      <Link
                        href="/orders"
                        className="rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-600 transition"
                      >
                        ⭐ Rate & Review Order
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Link
                      href="/orders"
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline"
                    >
                      Order History
                    </Link>
                    <Link
                      href="/home"
                      className="text-xs font-semibold text-amber-700 hover:underline"
                    >
                      Order More Dishes →
                    </Link>
                  </div>
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
                          <p className="text-[11px] text-slate-500 mt-0.5">x{it.quantity} @ ৳{it.unit_price}</p>
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
                    <span className="text-slate-500">Est. Delivery Time:</span>
                    <span className="font-bold text-amber-800">
                      {activeOrder.delivery_estimate?.delivery_time_range || "25 - 35 mins"}
                    </span>
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
                    <span className="text-amber-700">৳{activeOrder.total_amount || extractSumTotal(activeOrder.bill)}</span>
                  </div>
                </div>
              </Panel>

              {/* Modern Restaurant Bill Receipt */}
              <Panel className="p-6 space-y-4 bg-white border border-black/10 shadow-xs">
                <div className="flex items-center justify-between border-b border-black/5 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🧾</span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Official Restaurant Bill</h3>
                      <p className="text-[11px] text-slate-500">Printed itemized receipt stored in database</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(activeOrder.bill);
                      toast("Receipt copied to clipboard!", "success");
                    }}
                    className="rounded-full border border-black/10 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition"
                  >
                    📋 Copy Bill
                  </button>
                </div>

                <div className="rounded-xl border border-dashed border-slate-300 bg-amber-50/20 p-4 font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap select-all shadow-inner">
                  {activeOrder.bill && activeOrder.bill.includes("\n") ? (
                    activeOrder.bill.replace(/\n\s*Desc:[^\n]*/g, "")
                  ) : (
                    `Restaurant name: ${activeOrder.restaurant_name}
Order ID: #${activeOrder.order_id}
Timestamp: ${activeOrder.order_timestamp || "N/A"}
Payment: ${activeOrder.payment_method || "Cash on Delivery"}

Sum total = ${activeOrder.bill}`
                  )}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      )}
      </AppShell>
    </CustomerAccessGuard>
  );
}
