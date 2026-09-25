"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { ownerNav } from "@/lib/platform";
import { apiGetOwnerRestaurants, type OwnerRestaurant } from "@/lib/backend";

export default function OwnerDashboardPage() {
  const [restaurants, setRestaurants] = useState<OwnerRestaurant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetOwnerRestaurants().then(setRestaurants).finally(() => setLoading(false));
  }, []);

  return <AppShell role="Restaurant Owner" title="View Restaurants" subtitle="Your approved restaurants. Restaurant pages are reserved for a future release." nav={ownerNav}>
    <section className="space-y-4">
      <SectionHeading eyebrow="Approved listings" title="My Restaurants" description="Clicking a restaurant is intentionally inactive for now." />
      {loading ? <Panel className="p-8 text-center text-sm text-slate-500">Loading restaurants...</Panel> : restaurants.filter((restaurant) => restaurant.status !== "pending").length === 0 ? <Panel className="p-8 text-center text-sm text-slate-600">No approved restaurants yet.</Panel> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{restaurants.filter((restaurant) => restaurant.status !== "pending").map((restaurant) => <Link href={`/owner/restaurants/${restaurant.restaurant_id}`} key={restaurant.restaurant_id} className="text-left"><Panel className="space-y-4 p-5 transition hover:border-amber-300"><div className="flex h-32 items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-400">Restaurant picture coming later</div><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-slate-900">{restaurant.name}</h2><Badge tone={restaurant.status === "banned" ? "danger" : restaurant.status === "open" ? "success" : "neutral"}>{restaurant.status === "banned" ? "Banned" : restaurant.status === "open" ? "Open" : "Closed"}</Badge></div></Panel></Link>)}</div>}
    </section>
  </AppShell>;
}
