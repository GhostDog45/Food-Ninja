"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { getAuthToken, apiGetOrderRiderLocation, type RiderLiveLocationData } from "@/lib/backend";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000";

type OrderLiveTrackingMapProps = {
  orderId: string;
  orderStatus: string;
  customerLat?: number | null;
  customerLng?: number | null;
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  restaurantName?: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  riderVehicle?: "bike" | "bicycle" | string | null;
  onStatusChange?: (newStatus: string) => void;
};

export function OrderLiveTrackingMap({
  orderId,
  orderStatus,
  customerLat,
  customerLng,
  restaurantLat,
  restaurantLng,
  restaurantName = "Restaurant",
  riderName,
  riderPhone,
  riderVehicle = "bike",
  onStatusChange,
}: OrderLiveTrackingMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const restaurantMarkerRef = useRef<any>(null);

  const [connected, setConnected] = useState(false);
  const [riderCoords, setRiderCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [lastUpdateText, setLastUpdateText] = useState<string>("Connecting to GPS...");
  const [liveInfo, setLiveInfo] = useState<{
    riderName?: string;
    riderPhone?: string;
    riderVehicle?: string;
  }>({
    riderName: riderName ?? undefined,
    riderPhone: riderPhone ?? undefined,
    riderVehicle: riderVehicle ?? undefined,
  });

  const isDelivering = orderStatus === "delivering";

  // 1. Initial Leaflet Map Setup
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      const L = (await import("leaflet")).default;
      if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;
      if ((mapContainerRef.current as any)._leaflet_id) return;

      const defaultCenter: [number, number] = [
        customerLat || restaurantLat || 23.7262,
        customerLng || restaurantLng || 90.3903,
      ];

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 14,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      if (!isMounted) {
        map.remove();
        return;
      }

      mapInstanceRef.current = map;

      // Realtime OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Customer Location Pin (Blue/Emerald Home Marker)
      if (customerLat && customerLng) {
        const customerIcon = L.divIcon({
          className: "custom-customer-pin",
          html: `
            <div style="position: relative; width: 34px; height: 34px; transform: translate(-50%, -100%);">
              <div style="position: relative; width: 34px; height: 34px; border-radius: 9999px; background: #2563eb; border: 3px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 15px;">🏠</span>
              </div>
              <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 7px solid #2563eb;"></div>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        });
        customerMarkerRef.current = L.marker([customerLat, customerLng], { icon: customerIcon })
          .addTo(map)
          .bindPopup(`<b>Your Delivery Location</b><br/>Coordinates: ${customerLat.toFixed(4)}, ${customerLng.toFixed(4)}`);
      }

      // Restaurant Location Pin (Orange Store Marker)
      if (restaurantLat && restaurantLng) {
        const restaurantIcon = L.divIcon({
          className: "custom-restaurant-pin",
          html: `
            <div style="position: relative; width: 34px; height: 34px; transform: translate(-50%, -100%);">
              <div style="position: relative; width: 34px; height: 34px; border-radius: 9999px; background: #ea580c; border: 3px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 15px;">🍳</span>
              </div>
              <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 7px solid #ea580c;"></div>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        });
        restaurantMarkerRef.current = L.marker([restaurantLat, restaurantLng], { icon: restaurantIcon })
          .addTo(map)
          .bindPopup(`<b>${restaurantName}</b><br/>Pickup Origin`);
      }
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        (mapContainerRef.current as any)._leaflet_id = null;
      }
    };
  }, [customerLat, customerLng, restaurantLat, restaurantLng, restaurantName]);

  // 2. Initial Fetch & WebSocket Live Forwarding Listener
  useEffect(() => {
    // Access control: Only stream when delivering
    if (!isDelivering) {
      setConnected(false);
      setLastUpdateText(
        orderStatus === "delivered"
          ? "Delivery completed. Live tracking closed."
          : "Rider live tracking will activate once picked up."
      );
      return;
    }

    let socket: WebSocket | null = null;
    let isAlive = true;
    let pollInterval: NodeJS.Timeout | null = null;

    async function applyRiderFix(lat: number, lng: number) {
      if (!isAlive || !lat || !lng) return;
      setRiderCoords({ lat, lng });
      setLastUpdateText(`Updated at ${new Date().toLocaleTimeString()}`);

      const L = (await import("leaflet")).default;
      if (!mapInstanceRef.current || !isAlive) return;

      const vehicleIcon = liveInfo.riderVehicle === "bicycle" ? "🚲" : "🏍️";

      if (!riderMarkerRef.current) {
        const liveRiderIcon = L.divIcon({
          className: "custom-rider-live-pin",
          html: `
            <div style="position: relative; width: 44px; height: 44px; transform: translate(-50%, -50%);">
              <div style="position: absolute; inset: 0; border-radius: 9999px; background-color: rgba(16, 185, 129, 0.45); animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              <div style="position: relative; width: 44px; height: 44px; border-radius: 9999px; background: #10b981; border: 3px solid #ffffff; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.5); display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 20px;">${vehicleIcon}</span>
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        riderMarkerRef.current = L.marker([lat, lng], {
          icon: liveRiderIcon,
          zIndexOffset: 1000,
        })
          .addTo(mapInstanceRef.current)
          .bindPopup(`<b>${liveInfo.riderName || "Rider"} is delivering!</b><br/>Live GPS coordinates.`);
      } else {
        riderMarkerRef.current.setLatLng([lat, lng]);
      }
    }

    // A. Initial HTTP Snapshot
    apiGetOrderRiderLocation(orderId)
      .then((data) => {
        if (!isAlive) return;
        if (data.success && data.active && data.rider?.latitude && data.rider?.longitude) {
          setLiveInfo((prev) => ({
            riderName: data.rider?.name || prev.riderName,
            riderPhone: data.rider?.phone || prev.riderPhone,
            riderVehicle: data.rider?.vehicle || prev.riderVehicle,
          }));
          applyRiderFix(data.rider.latitude, data.rider.longitude);
        }
      })
      .catch(() => {});

    // B. Realtime WebSocket Stream from Backend
    const token = getAuthToken();
    if (token) {
      const wsUrl = BACKEND_URL.replace(/^http/, "ws") + `/orders/${orderId}/live_location`;
      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          if (!isAlive) return;
          socket?.send(JSON.stringify({ type: "auth", token }));
          setConnected(true);
        };

        socket.onmessage = (event) => {
          if (!isAlive) return;
          try {
            const data = JSON.parse(event.data);

            if (data.type === "init") {
              if (data.rider?.name) {
                setLiveInfo((prev) => ({
                  riderName: data.rider?.name || prev.riderName,
                  riderPhone: data.rider?.phone || prev.riderPhone,
                  riderVehicle: data.rider?.vehicle || prev.riderVehicle,
                }));
              }
              if (data.rider?.latitude && data.rider?.longitude) {
                applyRiderFix(data.rider.latitude, data.rider.longitude);
              }
            } else if (data.type === "location_update") {
              if (data.latitude && data.longitude) {
                applyRiderFix(data.latitude, data.longitude);
              }
            } else if (data.type === "status_change" || data.type === "status_denied") {
              // Status changed (e.g. delivered) - access revoked
              setConnected(false);
              if (data.status) onStatusChange?.(data.status);
              if (riderMarkerRef.current && mapInstanceRef.current) {
                mapInstanceRef.current.removeLayer(riderMarkerRef.current);
                riderMarkerRef.current = null;
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        socket.onerror = () => {
          if (isAlive) setConnected(false);
        };

        socket.onclose = () => {
          if (isAlive) setConnected(false);
        };
      } catch {
        setConnected(false);
      }
    }

    // C. Fallback Polling (Every 6 seconds) to maintain accuracy if WS drops
    pollInterval = setInterval(() => {
      if (!isAlive) return;
      apiGetOrderRiderLocation(orderId)
        .then((data) => {
          if (!isAlive) return;
          if (data.status && data.status !== "delivering") {
            onStatusChange?.(data.status);
            return;
          }
          if (data.rider?.latitude && data.rider?.longitude) {
            applyRiderFix(data.rider.latitude, data.rider.longitude);
          }
        })
        .catch(() => {});
    }, 6000);

    return () => {
      isAlive = false;
      if (pollInterval) clearInterval(pollInterval);
      if (socket) socket.close();
      if (riderMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(riderMarkerRef.current);
        riderMarkerRef.current = null;
      }
    };
  }, [orderId, isDelivering, orderStatus, onStatusChange]);

  // Helper to re-fit map view to fit rider + customer + restaurant
  async function handleFitRoute() {
    if (!mapInstanceRef.current) return;
    const L = (await import("leaflet")).default;
    const points: [number, number][] = [];

    if (riderCoords) points.push([riderCoords.lat, riderCoords.lng]);
    if (customerLat && customerLng) points.push([customerLat, customerLng]);
    if (restaurantLat && restaurantLng) points.push([restaurantLat, restaurantLng]);

    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (points.length === 1) {
      mapInstanceRef.current.setView(points[0], 15);
    }
  }

  // Helper to center directly on rider
  function handleCenterRider() {
    if (!mapInstanceRef.current || !riderCoords) return;
    mapInstanceRef.current.flyTo([riderCoords.lat, riderCoords.lng], 16, { duration: 1.2 });
  }

  return (
    <div className="space-y-3">
      {/* Live Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-3 w-3 rounded-full ${
              connected ? "bg-emerald-500 animate-pulse shadow-sm shadow-emerald-400" : "bg-amber-400"
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                {isDelivering ? "Live Rider GPS Delivery Tracking" : "Live GPS Tracking"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  connected
                    ? "bg-emerald-100 text-emerald-800"
                    : isDelivering
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {connected ? "LIVE GPS STREAMING" : isDelivering ? "CONNECTING..." : "ACCESS RESTRICTED"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">{lastUpdateText}</p>
          </div>
        </div>

        {isDelivering && (
          <div className="flex items-center gap-2">
            {riderCoords && (
              <button
                type="button"
                onClick={handleCenterRider}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 shadow-2xs"
              >
                🎯 Find Rider
              </button>
            )}
            <button
              type="button"
              onClick={handleFitRoute}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 shadow-2xs"
            >
              🗺️ Full Route
            </button>
          </div>
        )}
      </div>

      {/* Realtime OSM Map Container */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
        <div
          ref={mapContainerRef}
          className="h-80 w-full z-0"
          style={{ minHeight: "320px" }}
        />

        {/* Legend Overlay at Top Right */}
        <div className="absolute top-2.5 right-2.5 z-10 hidden sm:flex flex-col gap-1 rounded-xl border border-slate-200/90 bg-white/95 p-2 backdrop-blur-md text-[11px] shadow-xs">
          <div className="flex items-center gap-1.5 text-slate-700">
            <span>🏠</span> <span className="font-semibold">Your Location</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-700">
            <span>🍳</span> <span className="font-semibold">{restaurantName}</span>
          </div>
          {isDelivering && (
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
              <span>{liveInfo.riderVehicle === "bicycle" ? "🚲" : "🏍️"}</span>
              <span>{liveInfo.riderName || "Rider"} (Live)</span>
            </div>
          )}
        </div>

        {/* Floating Rider Status HUD at Bottom */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white/95 px-3.5 py-2.5 backdrop-blur-md shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-lg">
              {liveInfo.riderVehicle === "bicycle" ? "🚲" : "🏍️"}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">
                {liveInfo.riderName || "Assigned Rider"}
                {liveInfo.riderPhone && (
                  <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">
                    📞 {liveInfo.riderPhone}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                {isDelivering
                  ? riderCoords
                    ? `Current Fix: ${riderCoords.lat.toFixed(4)}° N, ${riderCoords.lng.toFixed(4)}° E`
                    : "Connecting to rider GPS signal..."
                  : orderStatus === "delivered"
                  ? "Order delivered to destination"
                  : "Rider will pick up from restaurant shortly"}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                isDelivering
                  ? "bg-emerald-100 text-emerald-800"
                  : orderStatus === "delivered"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {isDelivering ? "DELIVERING NOW" : orderStatus.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
