"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { customerNav } from "@/lib/platform";
import { CustomerAccessGuard } from "@/components/customer-access-guard";
import {
  apiGetUserNearbyRestaurants,
  apiGetUserCategories,
  apiSearchUserFoods,
  apiGetUserCart,
  type CustomerNearbyRestaurant,
  type CustomerSearchResult,
  type CartData,
} from "@/lib/backend";

export default function CustomerHomePage() {
  const [restaurants, setRestaurants] = useState<CustomerNearbyRestaurant[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [cart, setCart] = useState<CartData | null>(null);
  const [locationNotice, setLocationNotice] = useState<string>("");
  const [, startTransition] = useTransition();

  // Load initial data: categories, cart, and nearby restaurants
  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      setIsLoading(true);
      try {
        const [cats, cartRes, nearbyRes] = await Promise.all([
          apiGetUserCategories().catch(() => []),
          apiGetUserCart().catch(() => ({ has_cart: false, cart: null })),
          apiGetUserNearbyRestaurants().catch((err) => {
            return { restaurants: [], user_location: undefined, message: err.message };
          }),
        ]);

        if (!isMounted) return;

        setCategories(cats);
        setCart(cartRes.cart);
        setRestaurants(nearbyRes.restaurants || []);
        if (nearbyRes.user_location) {
          setUserLocation(nearbyRes.user_location);
        }
        if (nearbyRes.message) {
          setLocationNotice(nearbyRes.message);
        }
      } catch (err: any) {
        if (isMounted) setLocationNotice(err.message || "Failed to load nearby restaurants");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Debounced search by query and/or category
  useEffect(() => {
    if (!searchQuery.trim() && selectedCategory === "All") {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const catParam = selectedCategory !== "All" ? selectedCategory : undefined;
        const results = await apiSearchUserFoods(searchQuery.trim(), catParam, userLocation || undefined);
        startTransition(() => {
          setSearchResults(results);
          setIsSearching(false);
        });
      } catch {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, userLocation]);

  // Request browser GPS location
  function handleDetectGps() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setUserLocation(coords);
        setIsLoading(true);
        try {
          const res = await apiGetUserNearbyRestaurants(coords);
          setRestaurants(res.restaurants || []);
          setLocationNotice("");
        } catch (err: any) {
          setLocationNotice(err.message || "Failed to fetch restaurants for this GPS location");
        } finally {
          setIsLoading(false);
        }
      },
      () => {
        alert("Unable to retrieve your GPS location. Ensure location permissions are granted.");
      }
    );
  }

  const cartTotalItems = cart?.items.reduce((acc, it) => acc + it.quantity, 0) || 0;

  return (
    <CustomerAccessGuard>
      <AppShell
        role="Customer portal"
        title="Find your next meal"
        subtitle="Browse popular restaurants and fresh dishes near you with doorstep delivery."
        nav={customerNav}
        actions={
          <Link
            href="/checkout"
            className="flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
          >
            <span>🛒 Cart</span>
            {cartTotalItems > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-amber-700">
                {cartTotalItems}
              </span>
            )}
            {cart && cart.total > 0 && <span className="border-l border-amber-400 pl-2">৳{cart.total}</span>}
          </Link>
        }
      >
        <div className="space-y-6">
          {/* Header Panel */}
          <Panel className="space-y-5 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="primary">Nearby Delivery</Badge>
                  {userLocation ? (
                    <Badge tone="success">
                      📍 {userLocation.latitude.toFixed(4)}° N, {userLocation.longitude.toFixed(4)}° E
                    </Badge>
                  ) : (
                    <button
                      onClick={handleDetectGps}
                      className="text-xs font-medium text-amber-700 underline hover:text-amber-800"
                    >
                      Detect Live Location
                    </button>
                  )}
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  What do you want to eat today?
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  Find delicious meals and popular eateries near your location with fast delivery.
                </p>
              </div>

              {/* Search Input */}
              <div className="w-full lg:max-w-md space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dishes, cuisines, or restaurants..."
                    className="w-full rounded-2xl border border-black/10 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Panel>

          {/* Location Notice if user location is not set */}
          {locationNotice && (
            <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
              <span>{locationNotice}</span>
              <button
                onClick={handleDetectGps}
                className="ml-4 rounded-full bg-amber-500 px-3 py-1.5 font-semibold text-white hover:bg-amber-600"
              >
                Use Device GPS
              </button>
            </div>
          )}

          {/* Food Categories Horizontal Scroll Bar */}
          <section className="space-y-3">
            <SectionHeading eyebrow="Categories" title="Popular Cuisines" />
            <div className="flex gap-2.5 overflow-x-auto pb-2">
              <button
                type="button"
                onClick={() => setSelectedCategory("All")}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
                  selectedCategory === "All"
                    ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                    : "border-black/10 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium capitalize transition ${
                    selectedCategory === cat
                      ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                      : "border-black/10 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </section>

          {/* Search Results */}
          {(searchQuery.trim() || selectedCategory !== "All") && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <SectionHeading
                  eyebrow="Search Results"
                  title={
                    searchQuery
                      ? `Dishes matching "${searchQuery}"`
                      : `${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Dishes`
                  }
                  description="Showing available dishes from local kitchens."
                />
                {isSearching && (
                  <span className="text-xs text-amber-600 animate-pulse font-medium">Searching...</span>
                )}
              </div>

              {searchResults.length === 0 && !isSearching ? (
                <Panel className="p-8 text-center text-sm text-slate-500">
                  No dishes found matching your selection. Try another dish name or category.
                </Panel>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {searchResults.map((item) => (
                    <Panel key={item.food_id} className="space-y-3 overflow-hidden p-4">
                      {/* Dish Card Header */}
                      <div className="relative flex h-28 w-full items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200/50">
                        <div className="flex flex-col items-center gap-1 text-center">
                          <span className="text-2xl">🍲</span>
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                            {item.category}
                          </span>
                        </div>
                        {item.discount > 0 && (
                          <div className="absolute top-2 right-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                            {item.discount}% OFF
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-slate-900 leading-snug">{item.food_name}</h3>
                          <div className="text-right">
                            <span className="font-bold text-slate-900">৳{item.discounted_price}</span>
                            {item.discount > 0 && (
                              <span className="ml-1 text-xs text-slate-400 line-through">৳{item.price}</span>
                            )}
                          </div>
                        </div>

                        {item.description && (
                          <p className="text-xs text-slate-500 line-clamp-2">{item.description}</p>
                        )}
                      </div>

                      {/* Restaurant Info & Distance */}
                      <div className="rounded-xl border border-black/5 bg-slate-50 p-2.5 text-xs text-slate-600 space-y-1">
                        <div className="flex items-center justify-between font-medium text-slate-900">
                          <span className="truncate">🏪 {item.restaurant_name}</span>
                          <span className="text-amber-700 shrink-0">{item.distance_km} km</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>★ {item.restaurant_rating > 0 ? item.restaurant_rating : "New"}</span>
                          <span>{item.people_ordered_count} ordered</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <Link
                          href={`/restaurant/${item.restaurant_id}`}
                          className="text-xs font-semibold text-amber-700 hover:underline"
                        >
                          View Menu →
                        </Link>
                      </div>
                    </Panel>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Nearby Restaurants */}
          <section className="space-y-4">
            <SectionHeading
              eyebrow="Near You"
              title="Restaurants near you"
              description="Showing verified restaurants available for delivery in your area."
            />

            {isLoading ? (
              <Panel className="p-12 text-center text-sm text-slate-500">
                Finding nearby restaurants...
              </Panel>
            ) : restaurants.length === 0 ? (
              <Panel className="p-12 text-center space-y-2">
                <p className="text-sm font-semibold text-slate-800">No restaurants nearby</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  We could not find any active restaurants within range of your current location. Try clicking &quot;Detect Live Location&quot;.
                </p>
              </Panel>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {restaurants.map((restaurant) => (
                  <Panel key={restaurant.restaurant_id} className="space-y-4 overflow-hidden p-5">
                    {/* Restaurant Card Header */}
                    <div className="relative flex h-32 w-full items-center justify-center rounded-2xl bg-gradient-to-tr from-slate-100 via-amber-50 to-orange-50 border border-black/5">
                      <div className="flex flex-col items-center gap-1.5 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm text-lg">
                          🍽️
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{restaurant.name}</span>
                      </div>
                      <div className="absolute top-2.5 right-2.5">
                        <Badge tone={restaurant.status === "open" ? "success" : "neutral"}>
                          {restaurant.status === "open" ? "Open" : restaurant.status}
                        </Badge>
                      </div>
                      <div className="absolute bottom-2.5 left-2.5 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                        📍 {restaurant.distance_km} km away
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-bold text-slate-900">{restaurant.name}</h3>
                        <Badge tone="success">
                          {restaurant.rating > 0 ? `★ ${restaurant.rating}` : "★ New"}
                        </Badge>
                      </div>

                      {/* Rating & Orders */}
                      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-black/5 bg-slate-50 p-3 text-xs">
                        <div>
                          <p className="text-slate-500 font-medium">Rating</p>
                          <p className="font-bold text-slate-900 text-sm">
                            {restaurant.rating > 0 ? `${restaurant.rating} / 5.0` : "New"}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {restaurant.review_count} {restaurant.review_count === 1 ? "review" : "reviews"}
                          </p>
                        </div>
                        <div className="border-l border-black/10 pl-3">
                          <p className="text-slate-500 font-medium">Orders</p>
                          <p className="font-bold text-amber-700 text-sm">
                            {restaurant.people_ordered_count} customers
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {restaurant.total_orders_count} {restaurant.total_orders_count === 1 ? "order" : "orders"} placed
                          </p>
                        </div>
                      </div>

                      {/* Opening Hours */}
                      {(restaurant.open_time || restaurant.close_time) && (
                        <p className="text-xs text-slate-500">
                          🕒 Hours: {restaurant.open_time?.slice(0, 5)} - {restaurant.close_time?.slice(0, 5)}
                        </p>
                      )}
                    </div>

                    {/* View Restaurant Details & Menu Button */}
                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-xs text-emerald-700 font-medium">✓ Delivery Available</span>
                      <Link
                        href={`/restaurant/${restaurant.restaurant_id}`}
                        className="inline-flex items-center rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
                      >
                        View Menu →
                      </Link>
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </section>
        </div>
      </AppShell>
    </CustomerAccessGuard>
  );
}
