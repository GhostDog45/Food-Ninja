"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { riderNav } from "@/lib/platform";
import { apiAcceptRiderOrder, apiGetRiderOffers, apiGetRiderStatus, apiRiderOrderAction, apiSetRiderAvailability, type RiderOrder } from "@/lib/backend";
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
            <Panel className="space-y-4 p-6">
              <SectionHeading eyebrow="Assigned delivery" title={activeOrder.restaurant_name} />
              <p className="text-sm">Order {activeOrder.order_id}</p>
              <p className="text-xs text-slate-500">Customer dropoff: {activeOrder.customer_latitude}, {activeOrder.customer_longitude}</p>
              <p className="font-semibold">{activeOrder.status === "pending" ? "Collect this order from the restaurant" : "Deliver the order to the customer"}</p>
              <button type="button" disabled={busy} onClick={() => void advance(activeOrder.status === "pending" ? "pickup" : "delivered")} className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {activeOrder.status === "pending" ? "Received from restaurant" : "Delivered"}
              </button>
            </Panel>
          ) : (
            <Panel className="space-y-4 p-6">
              <SectionHeading eyebrow="Nearby offers" title="Order queue" description="Offers cycle when skipped. Service distances are verified by the server." />
              {status !== "online" ? <p className="text-sm text-slate-500">Go online to receive offers.</p> : currentOffer ? (
                <div className="space-y-3 rounded-2xl border border-black/10 bg-slate-50 p-4">
                  <div className="flex items-center justify-between"><h3 className="font-bold">{currentOffer.restaurant_name}</h3><Badge tone="warning">Pending</Badge></div>
                  <p className="text-xs text-slate-600">Order {currentOffer.order_id}</p>
                  <p className="text-xs text-slate-600">Restaurant: {currentOffer.restaurant_latitude}, {currentOffer.restaurant_longitude}</p>
                  <p className="text-xs text-slate-600">Customer: {currentOffer.customer_name || "Customer"} · {currentOffer.customer_latitude}, {currentOffer.customer_longitude}</p>
                  <p className="text-sm font-semibold text-emerald-800">Delivery charge: ৳{deliveryFee || "0.00"}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={skipCurrent} className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold">Skip</button>
                    <button type="button" disabled={busy} onClick={() => void acceptCurrent()} className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Accept</button>
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
    </AppShell>
  );
}
