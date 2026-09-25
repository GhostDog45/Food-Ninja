"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { ownerNav } from "@/lib/platform";
import { apiDeleteFood, apiGetOwnerRestaurantDetail, apiUpdateOwnerRestaurant, type OwnerFood, type OwnerRestaurant } from "@/lib/backend";

export default function OwnerRestaurantDetailPage() {
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<OwnerRestaurant | null>(null);
  const [foods, setFoods] = useState<OwnerFood[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"open" | "closed">("closed");

  async function load() { try { const data = await apiGetOwnerRestaurantDetail(params.id); setRestaurant(data.restaurant); setFoods(data.foods); setStatus(data.restaurant.status === "open" ? "open" : "closed"); } catch (error) { toast(error instanceof Error ? error.message : "Failed to load restaurant", "danger"); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [params.id]);
  async function save() { if (!restaurant) return; try { await apiUpdateOwnerRestaurant(params.id, { open_time: restaurant.open_time, close_time: restaurant.close_time, status }); toast("Restaurant updated", "success"); await load(); } catch (error) { toast(error instanceof Error ? error.message : "Failed to update restaurant", "danger"); } }
  async function removeFood(foodId: string) { try { await apiDeleteFood(params.id, foodId); toast("Food removed", "success"); await load(); } catch (error) { toast(error instanceof Error ? error.message : "Failed to remove food", "danger"); } }

  if (loading) return <AppShell role="Restaurant Owner" title="Restaurant details" subtitle="Loading..." nav={ownerNav}><Panel className="p-8 text-center">Loading...</Panel></AppShell>;
  if (!restaurant) return <AppShell role="Restaurant Owner" title="Restaurant details" subtitle="Unavailable" nav={ownerNav}><Panel className="p-8 text-center">Restaurant not found.</Panel></AppShell>;
  const grouped = foods.reduce<Record<string, OwnerFood[]>>((groups, food) => { const key = food.subcategory || "Other"; (groups[key] ||= []).push(food); return groups; }, {});
  return <AppShell role="Restaurant Owner" title={restaurant.name} subtitle="Edit restaurant operations and manage food items." nav={ownerNav}><div className="space-y-6"><Panel className="space-y-4 p-6"><div className="flex items-center justify-between"><SectionHeading eyebrow="Restaurant details" title={restaurant.name} /><Badge tone={restaurant.status === "banned" ? "danger" : status === "open" ? "success" : "neutral"}>{restaurant.status === "banned" ? "Banned" : status}</Badge></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Open time<input type="time" value={restaurant.open_time.slice(0, 5)} onChange={(event) => setRestaurant({ ...restaurant, open_time: `${event.target.value}:00` })} className="mt-1 w-full rounded-xl border px-3 py-2" disabled={restaurant.status === "banned"} /></label><label className="text-sm font-semibold">Close time<input type="time" value={restaurant.close_time.slice(0, 5)} onChange={(event) => setRestaurant({ ...restaurant, close_time: `${event.target.value}:00` })} className="mt-1 w-full rounded-xl border px-3 py-2" disabled={restaurant.status === "banned"} /></label></div><div className="flex gap-2"><button type="button" onClick={() => setStatus("open")} disabled={restaurant.status === "banned"} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Force open</button><button type="button" onClick={() => setStatus("closed")} disabled={restaurant.status === "banned"} className="rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold text-white">Force close</button><button type="button" onClick={save} disabled={restaurant.status === "banned"} className="rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white">Save</button></div></Panel><Panel className="space-y-4 p-6"><SectionHeading eyebrow="Menu" title="Food items" />{Object.keys(grouped).length === 0 ? <p className="text-sm text-slate-500">No food items.</p> : Object.entries(grouped).map(([subcategory, items]) => <section key={subcategory} className="space-y-2"><h3 className="font-bold text-slate-800">{subcategory}</h3>{items.map((food) => <div key={food.food_id} className="flex items-center justify-between border-b py-2 text-sm"><span>{food.name} <span className="text-slate-500">{food.category} · ৳{food.price}</span></span><button type="button" onClick={() => removeFood(food.food_id)} className="text-xs font-semibold text-rose-600">Remove</button></div>)}</section>)}</Panel></div></AppShell>;
}
