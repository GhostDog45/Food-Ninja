"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { ownerNav } from "@/lib/platform";
import { apiDeleteRestaurant, apiGetOwnerRestaurants, type OwnerRestaurant } from "@/lib/backend";

export default function OwnerPendingPage() {
  const { toast } = useToast();
  const [restaurants, setRestaurants] = useState<OwnerRestaurant[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() { setLoading(true); try { setRestaurants(await apiGetOwnerRestaurants()); } catch (error) { toast(error instanceof Error ? error.message : "Failed to load deployments", "danger"); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function cancel(id: string) { try { await apiDeleteRestaurant(id); toast("Deployment cancelled", "success"); await load(); } catch (error) { toast(error instanceof Error ? error.message : "Failed to cancel deployment", "danger"); } }

  const pending = restaurants.filter((restaurant) => restaurant.status === "pending");
  return <AppShell role="Restaurant Owner" title="Pending Restaurants" subtitle="Restaurants waiting for administrator approval." nav={ownerNav}><SectionHeading eyebrow="Approval queue" title="Pending deployments" />{loading ? <Panel className="mt-4 p-8 text-center text-sm text-slate-500">Loading deployments...</Panel> : pending.length === 0 ? <Panel className="mt-4 p-8 text-center text-sm text-slate-600">No pending deployments.</Panel> : <div className="mt-4 space-y-3">{pending.map((restaurant) => <Panel key={restaurant.restaurant_id} className="flex items-center justify-between gap-4 p-5"><div><h2 className="font-bold text-slate-900">{restaurant.name}</h2><p className="text-xs text-slate-500">{restaurant.open_time?.slice(0, 5)} - {restaurant.close_time?.slice(0, 5)}</p><Badge tone="warning">Pending admin approval</Badge></div><button type="button" onClick={() => cancel(restaurant.restaurant_id)} className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white">Cancel deployment</button></Panel>)}</div>}</AppShell>;
}
