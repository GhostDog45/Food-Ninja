"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { ownerNav } from "@/lib/platform";
import { apiGetOwnerRestaurants, getImageUrl, type OwnerRestaurant } from "@/lib/backend";

export default function OwnerDashboardPage() {
  const [restaurants, setRestaurants] = useState<OwnerRestaurant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetOwnerRestaurants().then(setRestaurants).finally(() => setLoading(false));
  }, []);

  return (
    <AppShell
      role="Restaurant Owner"
      title="View Restaurants"
      subtitle="Your approved restaurants. Select a restaurant to manage its menu, orders, cover photo, and details."
      nav={ownerNav}
    >
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Approved listings"
          title="My Restaurants"
          description="Select a restaurant to manage its details, menu, cover image, and live orders."
        />
        {loading ? (
          <Panel className="p-8 text-center text-sm text-slate-500">Loading restaurants...</Panel>
        ) : restaurants.filter((restaurant) => restaurant.status !== "pending").length === 0 ? (
          <Panel className="p-8 text-center text-sm text-slate-600">No approved restaurants yet.</Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants
              .filter((restaurant) => restaurant.status !== "pending")
              .map((restaurant) => (
                <Link
                  href={`/owner/restaurants/${restaurant.restaurant_id}`}
                  key={restaurant.restaurant_id}
                  className="text-left group"
                >
                  <Panel className="space-y-4 p-5 transition hover:border-amber-300 hover:shadow-md">
                    <div className="relative flex h-36 w-full items-center justify-center rounded-2xl bg-gradient-to-tr from-slate-100 via-amber-50 to-orange-50 border border-black/5 overflow-hidden">
                      {restaurant.picture_url ? (
                        <img
                          src={getImageUrl(restaurant.picture_url)}
                          alt={restaurant.name}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm text-lg">
                            🍽️
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{restaurant.name}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-bold text-slate-900 group-hover:text-amber-600 transition-colors">{restaurant.name}</h2>
                      <Badge
                        tone={
                          restaurant.status === "banned"
                            ? "danger"
                            : restaurant.status === "open"
                            ? "success"
                            : "neutral"
                        }
                      >
                        {restaurant.status === "banned" ? "Banned" : restaurant.status === "open" ? "Open" : "Closed"}
                      </Badge>
                    </div>
                  </Panel>
                </Link>
              ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
