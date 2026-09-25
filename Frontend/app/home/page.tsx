"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { customerNav } from "@/lib/platform";
import { CustomerAccessGuard } from "@/components/customer-access-guard";
import { useToast } from "@/components/toast-provider";
import { Modal } from "@/components/modal";
import {
  apiGetUserNearbyRestaurants,
  apiGetUserCategories,
  apiSearchUserFoods,
  apiGetUserCart,
  apiAddToCart,
  type CustomerNearbyRestaurant,
  type CustomerSearchResult,
  type CartData,
} from "@/lib/backend";

type SortOption = "distance" | "delivery time" | "rating" | "popularity";
type ViewFilter = "all" | "restaurants" | "dishes";

const sortOptions: { label: string; value: SortOption; icon: string }[] = [
  { label: "Distance", value: "distance", icon: "📍" },
  { label: "Delivery Time", value: "delivery time", icon: "⏱️" },
  { label: "Rating", value: "rating", icon: "★" },
  { label: "Popularity", value: "popularity", icon: "🔥" },
];

const ITEMS_PER_PAGE = 15;

function sortRestaurants(list: CustomerNearbyRestaurant[], criterion: SortOption): CustomerNearbyRestaurant[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    // Open restaurants come first, closed restaurants follow
    const aOpen = a.status === "open" ? 0 : 1;
    const bOpen = b.status === "open" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;

    if (criterion === "rating") {
      return b.rating - a.rating || b.review_count - a.review_count;
    } else if (criterion === "popularity") {
      return (
        b.people_ordered_count - a.people_ordered_count ||
        b.total_orders_count - a.total_orders_count
      );
    } else if (criterion === "delivery time") {
      const aTime = a.delivery_time_mins ?? Math.round(15 + a.distance_meters / 200);
      const bTime = b.delivery_time_mins ?? Math.round(15 + b.distance_meters / 200);
      return aTime - bTime || a.distance_meters - b.distance_meters;
    } else {
      return a.distance_meters - b.distance_meters;
    }
  });
  return sorted;
}

function sortSearchResults(list: CustomerSearchResult[], criterion: SortOption): CustomerSearchResult[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    const aOpen = a.restaurant_status === "open" ? 0 : 1;
    const bOpen = b.restaurant_status === "open" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;

    if (criterion === "rating") {
      return b.restaurant_rating - a.restaurant_rating;
    } else if (criterion === "popularity") {
      return b.people_ordered_count - a.people_ordered_count;
    } else if (criterion === "delivery time") {
      return a.distance_meters - b.distance_meters;
    } else {
      return a.distance_meters - b.distance_meters;
    }
  });
  return sorted;
}

export default function CustomerHomePage() {
  const [restaurants, setRestaurants] = useState<CustomerNearbyRestaurant[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("distance");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [cart, setCart] = useState<CartData | null>(null);
  const [locationNotice, setLocationNotice] = useState<string>("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingAddFood, setPendingAddFood] = useState<{ foodId: string; quantity: number } | null>(null);
  const [existingRestaurantName, setExistingRestaurantName] = useState("");
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  async function handleAddToCart(foodId: string, quantity = 1, replace = false) {
    try {
      const res = await apiAddToCart(foodId, quantity, replace);
      if (res.conflict) {
        setExistingRestaurantName(res.existing_restaurant || "another restaurant");
        setPendingAddFood({ foodId, quantity });
        setConflictModalOpen(true);
        return;
      }
      toast(res.message || "Dish added to cart", "success");
      const cartRes = await apiGetUserCart();
      setCart(cartRes.cart);
    } catch (err: any) {
      toast(err.message || "Could not add to cart", "danger");
    }
  }

  async function handleConfirmReplaceCart() {
    if (!pendingAddFood) return;
    try {
      await handleAddToCart(pendingAddFood.foodId, pendingAddFood.quantity, true);
      setConflictModalOpen(false);
      setPendingAddFood(null);
    } catch (err: any) {
      toast(err.message || "Failed to update cart", "danger");
    }
  }

  function handleSortChange(newSort: SortOption) {
    setSortBy(newSort);
    setCurrentPage(1);
    setRestaurants((prev) => sortRestaurants(prev, newSort));
  }

  // Load initial data: categories, cart, and nearby restaurants
  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      setIsLoading(true);
      try {
        const [cats, cartRes, nearbyRes] = await Promise.all([
          apiGetUserCategories().catch(() => []),
          apiGetUserCart().catch(() => ({ has_cart: false, cart: null })),
          apiGetUserNearbyRestaurants({ sort: sortBy }).catch((err) => {
            return { restaurants: [], user_location: undefined, message: err.message };
          }),
        ]);

        if (!isMounted) return;

        setCategories(cats);
        setCart(cartRes.cart);
        setRestaurants(sortRestaurants(nearbyRes.restaurants || [], sortBy));
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
          const res = await apiGetUserNearbyRestaurants({ ...coords, sort: sortBy });
          setRestaurants(sortRestaurants(res.restaurants || [], sortBy));
          setCurrentPage(1);
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
  const isSearchActive = Boolean(searchQuery.trim() || selectedCategory !== "All");

  const matchingCategoryChips = categories.filter((c) => {
    if (!searchQuery.trim()) return false;
    return c.toLowerCase().includes(searchQuery.trim().toLowerCase());
  });

  const searchQ = searchQuery.trim().toLowerCase();
  const searchRestaurantIds = new Set(searchResults.map((f) => f.restaurant_id));

  const filteredRestaurants = restaurants.filter((r) => {
    if (!isSearchActive) return true;

    const nameMatches = searchQ ? r.name.toLowerCase().includes(searchQ) : false;
    const foodMatches = searchRestaurantIds.has(r.restaurant_id);

    // When a text search is typed, only show restaurants whose own name matches the query
    if (searchQ) {
      if (selectedCategory !== "All") {
        return nameMatches && foodMatches;
      }
      return nameMatches;
    }

    // When only a cuisine category is selected (no text query), show restaurants serving that cuisine
    return foodMatches;
  });

  const sortedMatchingRestaurants = sortRestaurants(filteredRestaurants, sortBy);
  const sortedDishes = sortSearchResults(searchResults, sortBy);

  const paginatedRestaurants = isSearchActive
    ? sortedMatchingRestaurants
    : sortedMatchingRestaurants.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
      );
  const totalPages = Math.ceil(restaurants.length / ITEMS_PER_PAGE) || 1;

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

          {/* Unified Discovery Section: Cuisines, Sort Controls, Restaurants, Foods & Categories all in one */}
          <section className="space-y-6">
            {/* Header: Title, Description, and Restaurant Sorting Buttons */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between border-b border-black/5 pb-4">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.22em] text-amber-700 font-semibold">
                  {isSearchActive ? "Search & Explore" : "Near You"}
                </p>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  {isSearchActive
                    ? searchQuery.trim()
                      ? `Results for "${searchQuery.trim()}"`
                      : `${selectedCategory} Kitchens & Dishes`
                    : "Restaurants near you"}
                </h2>
                <p className="text-xs text-slate-500">
                  {isSearchActive
                    ? "Showing matching restaurants, dishes, and cuisines near your delivery location."
                    : "Showing verified eateries and local kitchens available for delivery in your area."}
                </p>
              </div>

              {/* Sorting Buttons: Always Available */}
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <span className="text-xs font-semibold text-slate-500 mr-1">Sort by:</span>
                {sortOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSortChange(opt.value)}
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      sortBy === opt.value
                        ? "bg-amber-500 text-white shadow-sm ring-1 ring-amber-600"
                        : "border border-black/10 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cuisine Sorting & Category Pills: Always Available */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Cuisines & Categories
                </span>
                {selectedCategory !== "All" && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("All");
                      setCurrentPage(1);
                    }}
                    className="text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Reset to All Cuisines
                  </button>
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory("All");
                    setCurrentPage(1);
                  }}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition ${
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
                    onClick={() => {
                      setSelectedCategory(cat);
                      setCurrentPage(1);
                    }}
                    className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold capitalize transition ${
                      selectedCategory === cat
                        ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                        : "border-black/10 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* When Search or Category Filter is Active: View Tabs & Matching Cuisines */}
            {isSearchActive && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewFilter("all")}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                        viewFilter === "all"
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      All Results ({sortedMatchingRestaurants.length + sortedDishes.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewFilter("restaurants")}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                        viewFilter === "restaurants"
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      🍽️ Restaurants ({sortedMatchingRestaurants.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewFilter("dishes")}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                        viewFilter === "dishes"
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      🍲 Dishes ({sortedDishes.length})
                    </button>
                  </div>

                  {isSearching && (
                    <span className="text-xs text-amber-600 animate-pulse font-medium">
                      Searching restaurants & dishes...
                    </span>
                  )}
                </div>

                {matchingCategoryChips.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Matching cuisines:</span>
                    {matchingCategoryChips.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSelectedCategory(c)}
                        className="rounded-full bg-amber-100 text-amber-800 px-3 py-1 font-semibold hover:bg-amber-200 transition"
                      >
                        🏷️ {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Results Grid / Content */}
            {isLoading ? (
              <Panel className="p-12 text-center text-sm text-slate-500">
                Finding nearby restaurants and dishes...
              </Panel>
            ) : isSearchActive && sortedMatchingRestaurants.length === 0 && sortedDishes.length === 0 && !isSearching ? (
              <Panel className="p-12 text-center space-y-3 max-w-md mx-auto">
                <div className="text-3xl">🔍</div>
                <h3 className="text-base font-bold text-slate-900">No matches found</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  We could not find any restaurants or dishes matching &quot;{searchQuery || selectedCategory}&quot;. Try adjusting your keywords or picking another cuisine.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("All");
                  }}
                  className="rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition"
                >
                  Clear Search Filters
                </button>
              </Panel>
            ) : (
              <div className="space-y-8">
                {/* 1. Restaurants Grid */}
                {(viewFilter === "all" || viewFilter === "restaurants") && sortedMatchingRestaurants.length > 0 && (
                  <div className="space-y-3">
                    {isSearchActive && (
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">
                          Restaurants ({sortedMatchingRestaurants.length})
                        </h3>
                      </div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {paginatedRestaurants.map((restaurant) => {
                        const estDeliveryMins =
                          restaurant.delivery_time_mins ?? Math.round(15 + restaurant.distance_meters / 200);

                        return (
                          <Panel key={restaurant.restaurant_id} className="space-y-4 overflow-hidden p-5 flex flex-col justify-between">
                            <div className="space-y-4">
                              {/* Restaurant Card Header */}
                              <div className="relative flex h-32 w-full items-center justify-center rounded-2xl bg-gradient-to-tr from-slate-100 via-amber-50 to-orange-50 border border-black/5">
                                <div className="flex flex-col items-center gap-1.5 text-center">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm text-lg">
                                    🍽️
                                  </div>
                                  <span className="text-xs font-semibold text-slate-700">{restaurant.name}</span>
                                </div>
                                <div className="absolute top-2.5 right-2.5">
                                  <Badge tone={restaurant.status === "open" ? "success" : "danger"}>
                                    {restaurant.status === "open" ? "Open" : "Closed"}
                                  </Badge>
                                </div>
                                <div className="absolute bottom-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 px-2.5 py-0.5 text-[11px] font-bold text-slate-800 shadow-sm backdrop-blur-sm">
                                    📍 {restaurant.distance_km} km
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/95 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 shadow-sm backdrop-blur-sm">
                                    ⏱️ {estDeliveryMins} mins
                                  </span>
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

                                {/* Opening Hours & Est Delivery */}
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                  {restaurant.open_time || restaurant.close_time ? (
                                    <span>
                                      🕒 {restaurant.open_time?.slice(0, 5)} - {restaurant.close_time?.slice(0, 5)}
                                    </span>
                                  ) : (
                                    <span>🕒 Daily</span>
                                  )}
                                  <span className="font-medium text-slate-600">⏱️ Est. {estDeliveryMins} mins</span>
                                </div>
                              </div>
                            </div>

                            {/* View Restaurant Details & Menu Button */}
                            <div className="pt-3 flex items-center justify-between border-t border-black/5">
                              {restaurant.status === "open" ? (
                                <span className="text-xs text-emerald-700 font-medium">✓ Delivery Available</span>
                              ) : (
                                <span className="text-xs text-rose-600 font-medium flex items-center gap-1">
                                  <span>🔒</span> Currently Closed
                                </span>
                              )}
                              <Link
                                href={`/restaurant/${restaurant.restaurant_id}`}
                                className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold shadow-sm transition ${
                                  restaurant.status === "open"
                                    ? "bg-amber-500 text-white hover:bg-amber-600"
                                    : "border border-black/10 bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }`}
                              >
                                {restaurant.status === "open" ? "View Menu →" : "View Details →"}
                              </Link>
                            </div>
                          </Panel>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Dishes Grid (Shown when searching / category filtered) */}
                {isSearchActive && (viewFilter === "all" || viewFilter === "dishes") && sortedDishes.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">
                        Dishes & Foods ({sortedDishes.length})
                      </h3>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {sortedDishes.map((item) => (
                        <Panel key={item.food_id} className="space-y-3 overflow-hidden p-4 flex flex-col justify-between">
                          <div className="space-y-2">
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
                              <div className="absolute top-2 left-2">
                                <Badge tone={item.restaurant_status === "open" ? "success" : "danger"}>
                                  {item.restaurant_status === "open" ? "Open" : "Closed"}
                                </Badge>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-semibold text-slate-900 leading-snug">{item.food_name}</h3>
                                <div className="text-right shrink-0">
                                  <span className="font-bold text-slate-900">৳{item.discounted_price}</span>
                                  {item.discount > 0 && (
                                    <span className="block text-[11px] text-slate-400 line-through">৳{item.price}</span>
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
                                <Link
                                  href={`/restaurant/${item.restaurant_id}`}
                                  className="truncate hover:text-amber-700 hover:underline font-semibold"
                                  title={`Visit ${item.restaurant_name}`}
                                >
                                  🏪 {item.restaurant_name}
                                </Link>
                                <span className="text-amber-700 shrink-0 font-semibold">{item.distance_km} km</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-500">
                                <span>★ {item.restaurant_rating > 0 ? item.restaurant_rating : "New"}</span>
                                <span>{item.people_ordered_count} ordered</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-black/5">
                            <Link
                              href={`/restaurant/${item.restaurant_id}`}
                              className="text-xs font-semibold text-amber-700 hover:underline"
                            >
                              Full Menu →
                            </Link>

                            {item.restaurant_status === "closed" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 cursor-not-allowed">
                                🔒 Closed
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddToCart(item.food_id)}
                                className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition"
                              >
                                <span>+ Add to Cart</span>
                              </button>
                            )}
                          </div>
                        </Panel>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pagination Controls when browsing all nearby restaurants */}
                {!isSearchActive && restaurants.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-black/5">
                    <div className="text-xs text-slate-500">
                      Showing <span className="font-semibold text-slate-700">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{" "}
                      <span className="font-semibold text-slate-700">
                        {Math.min(currentPage * ITEMS_PER_PAGE, restaurants.length)}
                      </span>{" "}
                      of <span className="font-semibold text-slate-700">{restaurants.length}</span> restaurants
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-black/10 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                          Previous
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-8 h-8 flex items-center justify-center text-xs font-semibold rounded-lg transition ${
                              currentPage === pageNum
                                ? "bg-amber-500 text-white shadow-sm"
                                : "border border-black/10 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {pageNum}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-black/10 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Restaurant Conflict Modal */}
          <Modal
            open={conflictModalOpen}
            title="Different Restaurant Detected"
            description="Your cart already contains dishes from another eatery."
            onClose={() => setConflictModalOpen(false)}
          >
            <div className="space-y-4 text-xs text-slate-700">
              <p className="leading-relaxed">
                You already have active items in your basket from <strong className="text-slate-900">{existingRestaurantName}</strong>.
                Would you like to clear your current basket and start a fresh order?
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConflictModalOpen(false)}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Keep Existing Cart
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReplaceCart}
                  className="rounded-full bg-amber-500 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-600"
                >
                  Clear Cart & Add Dish
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </AppShell>
    </CustomerAccessGuard>
  );
}
