"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { adminNav } from "@/lib/platform";
import { apiGetAdminRestaurantDetail, getImageUrl, type AdminOrder, type OwnerFood } from "@/lib/backend";

export default function AdminRestaurantDetailPage() {
  const params = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<Record<string, any> | null>(null);
  const [foods, setFoods] = useState<OwnerFood[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  useEffect(() => { apiGetAdminRestaurantDetail(params.id).then((data) => { setRestaurant(data.restaurant); setFoods(data.foods); setOrders(data.orders || []); }); }, [params.id]);
  const grouped = foods.reduce<Record<string, OwnerFood[]>>((groups, food) => { const key = food.subcategory || "Other"; (groups[key] ||= []).push(food); return groups; }, {});
  return <AppShell role="Admin panel" title={restaurant?.name || "Restaurant details"} subtitle="Full restaurant and menu details." nav={adminNav}>{!restaurant ? <Panel className="p-8 text-center">Loading...</Panel> : <div className="space-y-6"><Panel className="space-y-3 p-6"><SectionHeading eyebrow="Restaurant" title={restaurant.name} /><Badge tone={restaurant.status === "banned" ? "danger" : restaurant.status === "pending" ? "warning" : "success"}>{restaurant.status}</Badge><p className="text-sm text-slate-600">Owner: {restaurant.owner_name} · {restaurant.owner_email} · {restaurant.owner_phone}</p><p className="text-sm text-slate-600">Location: {restaurant.latitude}, {restaurant.longitude}</p><p className="text-sm text-slate-600">Hours: {restaurant.open_time} - {restaurant.close_time}</p></Panel><Panel className="space-y-4 p-6"><SectionHeading eyebrow="Menu" title="Food items" />{Object.entries(grouped).map(([subcategory, items]) => <section key={subcategory}><h3 className="font-bold text-slate-800">{subcategory}</h3>{items.map((food) => <div key={food.food_id} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><span className="flex items-center gap-3">{food.picture_url ? <Image src={getImageUrl(food.picture_url)} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded-md object-cover" /> : <span className="h-12 w-12 rounded-md bg-slate-100" />}<span>{food.name} · {food.category}</span></span><span>৳{food.price} ({food.discount}% off)</span></div>)}</section>)}</Panel><Panel className="space-y-4 p-6"><SectionHeading eyebrow="Restaurant orders" title="Order history" />{orders.length ? orders.map((order) => <article key={order.order_id} className="border-t border-black/5 pt-4"><div className="flex flex-wrap justify-between gap-2"><a href={`/admin/orders?order_id=${encodeURIComponent(order.order_id)}`} className="font-mono text-sm font-bold text-amber-700 hover:underline">{order.order_id}</a><span className="text-xs uppercase text-slate-500">{order.status} · {order.order_timestamp}</span></div><p className="mt-1 text-sm text-slate-600">Ordered by {order.customer_name} · Rider {order.rider_name || "Unassigned"}</p><pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{order.bill}</pre></article>) : <p className="text-sm text-slate-500">No orders found.</p>}</Panel></div>}</AppShell>;
}
