"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { Modal } from "@/components/modal";
import { riderNav } from "@/lib/platform";
import {
  apiAcceptRiderOrder,
  apiGetRiderOffers,
  apiGetRiderStatus,
  apiRiderOrderAction,
  apiRiderCancelOrder,
  apiSetRiderAvailability,
  getImageUrl,
  type RiderOrder,
} from "@/lib/backend";
import { RiderLiveLocation } from "@/components/rider-live-location";

export default function RiderDashboardPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState("offline");
  const statusRef = useRef(status);
  statusRef.current = status;
  const [baseReady, setBaseReady] = useState(false);
  const [balance, setBalance] = useState(0);
  const [dueAmount, setDueAmount] = useState(0);
  const [liveConnected, setLiveConnected] = useState(false);
  const [offers, setOffers] = useState<RiderOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<RiderOrder | null>(null);
  const [offerIndex, setOfferIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [liveCoordinates, setLiveCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const rider = await apiGetRiderStatus();
      setStatus(rider.status);
      setBaseReady(rider.has_location && Boolean(rider.vehicle));
      setBalance(rider.balance || 0);
      setDueAmount(rider.due_amount || 0);
      if (rider.status === "delivering") {
        const data = await apiGetRiderOffers();
        setActiveOrder(data.active_order);
        setOffers([]);
      } else if (rider.status === "online" && liveConnected) {
        const data = await apiGetRiderOffers();
        setOffers(data.offers);
        setActiveOrder(data.active_order);
      } else {
        setActiveOrder(null);
        setOffers([]);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to refresh rider status", "danger");
    }
  }, [liveConnected, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (status !== "online" || !liveConnected || activeOrder) return;
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [status, liveConnected, activeOrder, load]);

  const onLiveConnection = useCallback((connected: boolean) => {
    setLiveConnected(connected);
    if (!connected && statusRef.current === "online") {
      void apiSetRiderAvailability("offline").then(() => setStatus("offline")).catch(() => setStatus("offline"));
    }
  }, []);
  const onCoords = useCallback((latitude: number, longitude: number) => setLiveCoordinates({ latitude, longitude }), []);

  async function toggleAvailability() {
    setBusy(true);
    try {
      const next = status === "online" ? "offline" : "online";
      await apiSetRiderAvailability(next);
      setStatus(next);
      toast(next === "online" ? "You are online and receiving offers" : "You are offline", "success");
      await load();
    } catch (error) { toast(error instanceof Error ? error.message : "Availability update failed", "danger"); }
    finally { setBusy(false); }
  }
  async function acceptCurrent() {
    const offer = offers[offerIndex % Math.max(offers.length, 1)];
    if (!offer) return;
    setBusy(true);
    try { await apiAcceptRiderOrder(offer.order_id); toast("Order accepted. Pick it up from the restaurant.", "success"); await load(); }
    catch (error) { toast(error instanceof Error ? error.message : "Could not accept order", "warning"); await load(); }
    finally { setBusy(false); }
  }
  function skipCurrent() { if (offers.length) setOfferIndex((index) => (index + 1) % offers.length); }
  async function advance(action: "pickup" | "delivered") {
    if (!activeOrder) return;
    setBusy(true);
    try { await apiRiderOrderAction(activeOrder.order_id, action); toast(action === "pickup" ? "Pickup confirmed" : "Delivery complete; wallet credited", "success"); await load(); }
    catch (error) { toast(error instanceof Error ? error.message : "Order update failed", "danger"); }
    finally { setBusy(false); }
  }

  async function handleCancelRiderOrder() {
    if (!activeOrder) return;
    setBusy(true);
    try {
      await apiRiderCancelOrder(activeOrder.order_id);
      toast("Delivery order cancelled successfully.", "success");
      setCancelModalOpen(false);
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to cancel order", "danger");
    } finally {
      setBusy(false);
    }
  }

  const currentOffer = offers.length ? offers[offerIndex % offers.length] : null;
  const deliveryFee = currentOffer?.bill.match(/Delivery fee\s*=\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1];
  return (
    <AppShell role="Rider app" title="Delivery dashboard" subtitle="Enable live location, go online, and accept nearby orders." nav={riderNav} actions={<Badge tone={status === "online" ? "success" : status === "delivering" ? "warning" : "neutral"}>{status}</Badge>}>
      <div className="grid gap-6 xl:grid-cols-[1fr_.85fr]">
        <div className="space-y-5">
          <Panel className="space-y-4 p-6">
            <SectionHeading eyebrow="Live availability" title="Your location" description="Coordinates are sent over your active WebSocket session and are not saved in the database." />
            <RiderLiveLocation onConnected={onLiveConnection} onCoordinates={onCoords} />
            {liveCoordinates && <p className="font-mono text-xs text-slate-500">{liveCoordinates.latitude.toFixed(5)}, {liveCoordinates.longitude.toFixed(5)}</p>}
            <p className="text-xs text-slate-500">Saved base location and vehicle: {baseReady ? "Ready" : "Set both in your rider profile before accepting orders."}</p>
            <button type="button" disabled={busy || !baseReady || !liveConnected || status === "delivering"} onClick={() => void toggleAvailability()} className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? "Updating..." : status === "online" ? "Go offline" : status === "delivering" ? "Delivery in progress" : "Go online"}
            </button>
          </Panel>
          {activeOrder ? (
            <Panel className="space-y-5 p-6">
              <div className="flex items-center justify-between border-b border-black/5 pb-3">
                <div>
                  <SectionHeading eyebrow="Active Delivery" title={`Order #${activeOrder.order_id}`} />
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeOrder.status === "pending" ? "Awaiting pickup from restaurant" : "Out for delivery to customer"}
                  </p>
                </div>
                <Badge tone={activeOrder.status === "pending" ? "warning" : "primary"}>
                  {activeOrder.status === "pending" ? "Pickup Pending" : "Delivering"}
                </Badge>
              </div>

              {/* Restaurant & Customer Profile Cards with Images */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* 1. Restaurant Section */}
                <div className="rounded-2xl border border-amber-200/60 bg-amber-50/40 p-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">Restaurant Pickup</span>
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-amber-300/60 bg-amber-100 flex items-center justify-center relative shadow-xs">
                      {activeOrder.restaurant_picture_url ? (
                        <img
                          src={getImageUrl(activeOrder.restaurant_picture_url)}
                          alt={activeOrder.restaurant_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">🍽️</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-900 truncate">{activeOrder.restaurant_name}</h4>
                      <p className="text-[11px] font-mono text-slate-600">
                        📍 {activeOrder.restaurant_latitude?.toFixed(4)}, {activeOrder.restaurant_longitude?.toFixed(4)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Customer Section */}
                <div className="rounded-2xl border border-indigo-200/60 bg-indigo-50/40 p-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block">Customer Dropoff</span>
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-indigo-300/60 bg-indigo-100 flex items-center justify-center relative shadow-xs">
                      {activeOrder.customer_pfp_url ? (
                        <img
                          src={getImageUrl(activeOrder.customer_pfp_url)}
                          alt={activeOrder.customer_name || "Customer"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">👤</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-900 truncate">{activeOrder.customer_name || "Customer"}</h4>
                      {activeOrder.customer_phone && (
                        <p className="text-xs font-semibold text-slate-800">
                          📞 {activeOrder.customer_phone}
                        </p>
                      )}
                      <p className="text-[11px] font-mono text-slate-600">
                        📍 {activeOrder.customer_latitude?.toFixed(4)}, {activeOrder.customer_longitude?.toFixed(4)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void advance(activeOrder.status === "pending" ? "pickup" : "delivered")}
                  className="rounded-full bg-emerald-600 hover:bg-emerald-700 px-6 py-2.5 text-xs font-bold text-white shadow-sm transition disabled:opacity-50"
                >
                  {activeOrder.status === "pending" ? "✓ Confirm Food Pickup" : "✓ Mark Order Delivered"}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCancelModalOpen(true)}
                  className="rounded-full border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 px-4 py-2 text-xs font-semibold shadow-2xs transition disabled:opacity-50"
                >
                  ✕ Cancel Delivery
                </button>
              </div>
            </Panel>
          ) : (
            <Panel className="space-y-4 p-6">
              <SectionHeading eyebrow="Nearby offers" title="Order queue" description="Offers cycle when skipped. Service distances are verified by the server." />
              {status !== "online" ? (
                <p className="text-sm text-slate-500">Go online to receive offers.</p>
              ) : currentOffer ? (
                <div className="space-y-3.5 rounded-2xl border border-black/10 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-500">Order #{currentOffer.order_id}</span>
                    <Badge tone="warning">Pending Pickup</Badge>
                  </div>

                  {/* Restaurant & Customer Preview in Offer */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-2.5 rounded-xl bg-white p-2.5 border border-black/5 shadow-2xs">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-amber-100 flex items-center justify-center relative">
                        {currentOffer.restaurant_picture_url ? (
                          <img
                            src={getImageUrl(currentOffer.restaurant_picture_url)}
                            alt={currentOffer.restaurant_name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-lg">🍽️</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">Pickup</span>
                        <p className="text-xs font-bold text-slate-900 truncate">{currentOffer.restaurant_name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-xl bg-white p-2.5 border border-black/5 shadow-2xs">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100 flex items-center justify-center relative">
                        {currentOffer.customer_pfp_url ? (
                          <img
                            src={getImageUrl(currentOffer.customer_pfp_url)}
                            alt={currentOffer.customer_name || "Customer"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-lg">👤</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">Customer</span>
                        <p className="text-xs font-bold text-slate-900 truncate">{currentOffer.customer_name || "Customer"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-[11px] text-slate-500 block">Delivery Charge</span>
                      <p className="text-sm font-bold text-emerald-800">৳{deliveryFee || "0.00"}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={skipCurrent} className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold hover:bg-slate-50 transition">Skip</button>
                      <button type="button" disabled={busy} onClick={() => void acceptCurrent()} className="rounded-full bg-emerald-700 hover:bg-emerald-800 px-5 py-2 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50">Accept</button>
                    </div>
                  </div>
                </div>
              ) : <p className="text-sm text-slate-500">No eligible orders right now.</p>}
            </Panel>
          )}
        </div>
        <div className="space-y-5">
          <Panel className="space-y-3 p-6"><SectionHeading eyebrow="Service area" title="Offer eligibility" /><p className="text-xs text-slate-600">Restaurant within 8 km and customer within 10 km of your saved base; restaurant within 4 km of current live location.</p></Panel>
          <Panel className="space-y-4 p-6">
            <SectionHeading eyebrow="Financials" title="Earnings & Settlement" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-black/5 bg-slate-50/80 p-3.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Earnings Balance</span>
                <p className="mt-1 text-xl font-bold text-emerald-600">৳{balance.toFixed(2)}</p>
                <span className="text-[11px] text-slate-500">Your delivery earnings</span>
              </div>
              <div className="rounded-2xl border border-black/5 bg-slate-50/80 p-3.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Due to Platform</span>
                <p className="mt-1 text-xl font-bold text-rose-700">৳{dueAmount.toFixed(2)}</p>
                <span className="text-[11px] text-slate-500">Collected from COD</span>
              </div>
            </div>
            <p className="text-xs text-slate-600">Delivery fees are credited to your earnings balance. Cash collected from customers is tracked in Due to settle with owners/platform.</p>
          </Panel>
        </div>
      </div>

      {/* Rider Order Cancellation Confirmation Modal */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Delivery Assignment"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to cancel this delivery order? This will cancel the order and return your rider status to online so you can accept other deliveries.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setCancelModalOpen(false)}
              className="rounded-full border border-black/10 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
            >
              Nevermind
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCancelRiderOrder()}
              className="rounded-full bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
            >
              {busy ? "Cancelling..." : "Yes, Cancel Delivery"}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
