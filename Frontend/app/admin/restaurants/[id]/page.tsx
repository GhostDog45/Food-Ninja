"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { adminNav } from "@/lib/platform";
import { apiGetAdminRestaurantDetail, type OwnerFood } from "@/lib/backend";

export default function AdminRestaurantDetailPage() {
  const params = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<Record<string, any> | null>(null);
  const [foods, setFoods] = useState<OwnerFood[]>([]);
  useEffect(() => { apiGetAdminRestaurantDetail(params.id).then((data) => { setRestaurant(data.restaurant); setFoods(data.foods); }); }, [params.id]);
  const grouped = foods.reduce<Record<string, OwnerFood[]>>((groups, food) => { const key = food.subcategory || "Other"; (groups[key] ||= []).push(food); return groups; }, {});
  return <AppShell role="Admin panel" title={restaurant?.name || "Restaurant details"} subtitle="Full restaurant and menu details." nav={adminNav}>{!restaurant ? <Panel className="p-8 text-center">Loading...</Panel> : <div className="space-y-6"><Panel className="space-y-3 p-6"><SectionHeading eyebrow="Restaurant" title={restaurant.name} /><Badge tone={restaurant.status === "banned" ? "danger" : restaurant.status === "pending" ? "warning" : "success"}>{restaurant.status}</Badge><p className="text-sm text-slate-600">Owner: {restaurant.owner_name} · {restaurant.owner_email} · {restaurant.owner_phone}</p><p className="text-sm text-slate-600">Location: {restaurant.latitude}, {restaurant.longitude}</p><p className="text-sm text-slate-600">Hours: {restaurant.open_time} - {restaurant.close_time}</p></Panel><Panel className="space-y-4 p-6"><SectionHeading eyebrow="Menu" title="Food items" />{Object.entries(grouped).map(([subcategory, items]) => <section key={subcategory}><h3 className="font-bold text-slate-800">{subcategory}</h3>{items.map((food) => <div key={food.food_id} className="flex justify-between border-b py-2 text-sm"><span>{food.name} · {food.category}</span><span>৳{food.price} ({food.discount}% off)</span></div>)}</section>)}</Panel></div>}</AppShell>;
}
