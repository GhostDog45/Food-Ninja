"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGetAdminRestaurantDetail(params.id)
      .then((data) => {
        setRestaurant(data.restaurant);
        setFoods(data.foods);
        setOrders(data.orders || []);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const grouped = foods.reduce<Record<string, OwnerFood[]>>((groups, food) => {
    const key = food.subcategory || "Other";
    (groups[key] ||= []).push(food);
    return groups;
  }, {});

  return (
    <AppShell
      role="Admin panel"
      title={restaurant?.name || "Restaurant details"}
      subtitle="Full restaurant profile, menu catalogue, and order history."
      nav={adminNav}
    >
      {loading ? (
        <Panel className="p-12 text-center text-sm text-slate-500">Loading restaurant details...</Panel>
      ) : !restaurant ? (
        <Panel className="p-12 text-center text-sm text-slate-500">Restaurant not found.</Panel>
      ) : (
        <div className="space-y-6">
          <Panel className="space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SectionHeading eyebrow="Restaurant" title={restaurant.name} />
                <p className="mt-1 font-mono text-xs text-slate-500">ID: {restaurant.restaurant_id}</p>
              </div>
              <Badge
                tone={
                  restaurant.status === "banned"
                    ? "danger"
                    : restaurant.status === "pending"
                    ? "warning"
                    : "success"
                }
              >
                {restaurant.status}
              </Badge>
            </div>

            <dl className="grid gap-3 rounded-2xl border border-black/5 bg-slate-50/70 p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Owner Details</dt>
                <dd className="mt-1 font-medium text-slate-900">{restaurant.owner_name}</dd>
                <dd className="text-xs text-slate-600">{restaurant.owner_email}</dd>
                <dd className="text-xs text-slate-600">{restaurant.owner_phone}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Operating Hours</dt>
                <dd className="mt-1 font-medium text-slate-900">{restaurant.open_time} - {restaurant.close_time}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Coordinates</dt>
                <dd className="mt-1 font-mono text-xs text-slate-700">{restaurant.latitude}, {restaurant.longitude}</dd>
              </div>
            </dl>
          </Panel>

          <Panel className="space-y-6 p-6 sm:p-8">
            <SectionHeading
              eyebrow="Menu catalogue"
              title="Food items"
              description={`${foods.length} items across ${Object.keys(grouped).length} categories.`}
            />
            {Object.keys(grouped).length === 0 ? (
              <p className="text-sm text-slate-500">No food items added yet.</p>
            ) : (
              <div className="space-y-6">
                {Object.entries(grouped).map(([subcategory, items]) => (
                  <section key={subcategory} className="space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-black/5 pb-2">
                      {subcategory}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {items.map((food) => (
                        <div
                          key={food.food_id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-slate-50/60 p-3 transition hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-3">
                            {food.picture_url ? (
                              <Image
                                src={getImageUrl(food.picture_url)}
                                alt={food.name}
                                width={48}
                                height={48}
                                unoptimized
                                className="h-12 w-12 rounded-xl object-cover shadow-2xs"
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-xs font-bold text-amber-800">
                                🍽️
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-slate-900">{food.name}</p>
                              <p className="text-xs text-slate-500">{food.category}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-900">৳{food.price}</span>
                            {Number(food.discount) > 0 && (
                              <span className="block text-xs font-semibold text-emerald-600">
                                {food.discount}% off
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="space-y-6 p-6 sm:p-8">
            <SectionHeading
              eyebrow="Restaurant orders"
              title="Order history"
              description={`${orders.length} total orders recorded.`}
            />
            {orders.length ? (
              <div className="divide-y divide-black/5">
                {orders.map((order) => (
                  <article key={order.order_id} className="pt-5 first:pt-0 pb-5 last:pb-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/admin/orders?order_id=${encodeURIComponent(order.order_id)}`}
                        className="font-mono text-sm font-bold text-amber-700 hover:text-amber-800 hover:underline"
                      >
                        {order.order_id}
                      </Link>
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            order.status === "delivered"
                              ? "success"
                              : order.status === "cancelled" || order.status === "rejected"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {order.status}
                        </Badge>
                        <span className="text-xs text-slate-500">{order.order_timestamp}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">
                      Ordered by <span className="font-medium text-slate-900">{order.customer_name}</span> · Rider:{" "}
                      <span className="font-medium text-slate-900">{order.rider_name || "Unassigned"}</span>
                    </p>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-black/5 bg-slate-50/90 p-4 font-mono text-xs leading-5 text-slate-800 shadow-2xs">
                      {order.bill}
                    </pre>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No orders found.</p>
            )}
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
