"use client";

import { useEffect, useState } from "react";
import { getAuthToken, BACKEND_WS_URL } from "@/lib/backend";

type Props = { onConnected: (connected: boolean) => void; onCoordinates?: (lat: number, lng: number) => void };

export function RiderLiveLocation({ onConnected, onCoordinates }: Props) {
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let watchId: number | null = null;
    let alive = true;
    let firstFix = false;
    let latestFix: { latitude: number; longitude: number } | null = null;
    let heartbeat: number | null = null;
    let reconnectTimer: number | null = null;

    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      if (heartbeat !== null) window.clearInterval(heartbeat);
      heartbeat = null;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      socket?.close();
      socket = null;
      if (alive) {
        setConnected(false);
        onConnected(false);
      }
    };

    if (!navigator.geolocation) {
      setError("This browser does not support live location.");
      onConnected(false);
      return stop;
    }
    const token = getAuthToken();
    if (!token) {
      setError("Rider session is missing. Sign in again.");
      onConnected(false);
      return stop;
    }

    const connect = () => {
      if (!alive) return;
      const wsUrl = `${BACKEND_WS_URL}/rider/location/live`;
      socket = new WebSocket(wsUrl);
      socket.onopen = () => {
      socket?.send(JSON.stringify({ type: "auth", token }));
      if (!navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition((position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        latestFix = { latitude, longitude };
        onCoordinates?.(latitude, longitude);
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ latitude, longitude }));
          if (!firstFix) {
            firstFix = true;
            setConnected(true);
            onConnected(true);
          }
        }
      }, (locationError) => {
        setError(locationError.message || "Location permission is required to go online.");
        setConnected(false);
        onConnected(false);
        socket?.close();
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      heartbeat = window.setInterval(() => {
        if (latestFix && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(latestFix));
      }, 5000);
      };
      socket.onerror = () => {
        if (alive) setError("Live location connection failed. Check your connection and allow location access.");
      };
      socket.onclose = () => {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
        if (heartbeat !== null) window.clearInterval(heartbeat);
        heartbeat = null;
        if (alive) {
        setConnected(false);
        onConnected(false);
          setError("Live location disconnected. Reconnecting; you are offline until connected.");
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    };
    connect();

    return () => {
      alive = false;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (heartbeat !== null) window.clearInterval(heartbeat);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [onConnected, onCoordinates]);

  return <div className="text-xs"><span className={connected ? "text-emerald-700" : "text-slate-500"}>{connected ? "Live location connected" : "Live location off"}</span>{error && <p className="mt-1 text-rose-700">{error}</p>}</div>;
}
