"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading, cn } from "@/components/ui";
import { customerNav } from "@/lib/platform";
import { CustomerAccessGuard } from "@/components/customer-access-guard";
import { useToast } from "@/components/toast-provider";
import { Modal } from "@/components/modal";
import {
  apiGetUserRestaurantDetail,
  apiGetUserCart,
  apiAddToCart,
  apiUpdateCartItemQty,
  apiRemoveCartItem,
  apiDeleteUserCart,
  type CustomerRestaurantDetail,
  type CustomerFood,
  type CartData,
} from "@/lib/backend";

export default function RestaurantDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const restaurantId = (params?.id as string) || "";
  const { toast } = useToast();

  const [restaurant, setRestaurant] = useState<CustomerRestaurantDetail | null>(null);
  const [cart, setCart] = useState<CartData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [selectedFood, setSelectedFood] = useState<CustomerFood | null>(null);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingAddFood, setPendingAddFood] = useState<{ foodId: string; quantity: number } | null>(null);
  const [existingRestaurantName, setExistingRestaurantName] = useState("");
  const [isDeletingCart, setIsDeletingCart] = useState(false);

  // Load restaurant & cart
  async function refreshData() {
    setIsLoading(true);
    setAccessError(null);
    try {
      const [rDetail, cartRes] = await Promise.all([
        apiGetUserRestaurantDetail(restaurantId),
        apiGetUserCart().catch(() => ({ has_cart: false, cart: null })),
      ]);

      // Direct URL Access Control: Evaluate restaurant operating status
      if (!rDetail || (rDetail.status !== "open" && rDetail.status !== "closed")) {
        setAccessError("Access restricted. This restaurant is currently unauthorized or unavailable.");
        return;
      }

      setRestaurant(rDetail);
      setCart(cartRes.cart);
      if (rDetail && rDetail.status === "closed") {
        toast("This restaurant is currently closed off and not accepting orders.", "danger");
      }
    } catch (err: any) {
      setAccessError(err.message || "Access restricted. This restaurant is unavailable or does not exist.");
      toast(err.message || "Failed to load restaurant details", "danger");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (restaurantId) {
      refreshData();
    }
  }, [restaurantId]);

  async function handleAddToCart(foodId: string, quantity = 1, replace = false) {
    if (restaurant?.status === "closed") {
      toast("This restaurant is currently closed off and not accepting orders.", "danger");
      return;
    }
    try {
      const res = await apiAddToCart(foodId, quantity, replace);
      if (res.conflict) {
        setExistingRestaurantName(res.existing_restaurant || "another restaurant");
        setPendingAddFood({ foodId, quantity });
        setConflictModalOpen(true);
        return;
      }
      toast(res.message || "Added to cart", "success");
      const cartRes = await apiGetUserCart();
      setCart(cartRes.cart);
    } catch (err: any) {
      toast(err.message || "Could not add to cart", "danger");
    }
  }

  async function handleConfirmReplaceCart() {
    if (!pendingAddFood) return;
    if (restaurant?.status === "closed") {
      toast("This restaurant is closed off. You cannot initiate a new order.", "danger");
      setConflictModalOpen(false);
      setPendingAddFood(null);
      return;
    }
    try {
      await handleAddToCart(pendingAddFood.foodId, pendingAddFood.quantity, true);
      setConflictModalOpen(false);
      setPendingAddFood(null);
    } catch (err: any) {
      toast(err.message || "Failed to update cart", "danger");
    }
  }

  async function handleUpdateQty(foodId: string, newQty: number) {
    try {
      await apiUpdateCartItemQty(foodId, newQty);
      const cartRes = await apiGetUserCart();
      setCart(cartRes.cart);
    } catch (err: any) {
      toast(err.message || "Failed to update item quantity", "danger");
    }
  }

  async function handleRemoveItem(foodId: string) {
    try {
      await apiRemoveCartItem(foodId);
      toast("Item removed from cart", "default");
      const cartRes = await apiGetUserCart();
      setCart(cartRes.cart);
    } catch (err: any) {
      toast(err.message || "Failed to remove item", "danger");
    }
  }

  async function handleDeleteCart() {
    if (!confirm("Are you sure you want to empty your cart?")) return;
    setIsDeletingCart(true);
    try {
      await apiDeleteUserCart();
      toast("Cart has been cleared.", "success");
      setCart(null);
    } catch (err: any) {
      toast(err.message || "Failed to clear cart", "danger");
    } finally {
      setIsDeletingCart(false);
    }
  }

  const foodsByCategory: Record<string, CustomerFood[]> = {};
  if (restaurant?.foods) {
    for (const food of restaurant.foods) {
      if (!foodsByCategory[food.category]) {
        foodsByCategory[food.category] = [];
      }
      foodsByCategory[food.category].push(food);
    }
  }

  return (
    <CustomerAccessGuard>
      <AppShell
        role="Customer portal"
        title={restaurant ? restaurant.name : "Restaurant Menu"}
        subtitle="Explore menu dishes, view ratings, and add items to your cart."
        nav={customerNav}
        actions={
          restaurant?.status === "closed" && cart && cart.restaurant_name === restaurant.name ? (
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-500 cursor-not-allowed">
              <span>🔒 Orders Closed</span>
            </div>
          ) : (
            <Link
              href="/checkout"
              className="flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
            >
              <span>🛒 Checkout</span>
              {cart && cart.items.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-amber-700">
                  {cart.items.reduce((s, i) => s + i.quantity, 0)}
                </span>
              )}
            </Link>
          )
        }
      >
        {isLoading ? (
          <Panel className="p-12 text-center text-sm text-slate-500">
            Evaluating restaurant operating status and verifying access...
          </Panel>
        ) : accessError || !restaurant ? (
          <Panel className="p-12 text-center space-y-4 max-w-lg mx-auto">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-600">
              🚫
            </div>
            <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {accessError || "The requested restaurant is unavailable, restricted, or does not exist."}
            </p>
            <button
              onClick={() => router.push("/home")}
              className="rounded-full bg-amber-500 px-5 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition"
            >
              ← Back to Nearby Restaurants
            </button>
          </Panel>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
            {/* Left Column: Restaurant Info & Menu Categories */}
            <div className="space-y-6">
              {/* Closed Warning Banner */}
              {restaurant.status === "closed" && (
                <div className="rounded-2xl border border-rose-300 bg-rose-50/95 p-4 sm:p-5 text-rose-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-lg">
                      🔒
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-rose-950">This restaurant is currently closed off</h4>
                      <p className="text-xs text-rose-800 mt-0.5">
                        {restaurant.name} is not accepting new orders at this time. You can still view dishes and prices below.
                      </p>
                    </div>
                  </div>
                  <div className="sm:shrink-0">
                    <span className="inline-flex items-center rounded-full bg-rose-200/80 px-3 py-1 text-xs font-bold text-rose-900">
                      Orders Closed
                    </span>
                  </div>
                </div>
              )}

              {/* Restaurant Header Card */}
              <Panel className="space-y-5 p-6 overflow-hidden">
                <div className="relative flex h-36 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-200/40">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-md text-2xl">
                      🍽️
                    </div>
                    <span className="text-sm font-bold text-slate-800">{restaurant.name}</span>
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <Badge tone={restaurant.status === "open" ? "success" : "danger"}>
                      {restaurant.status === "open" ? "Open" : "Closed"}
                    </Badge>
                    <Badge tone={restaurant.status === "open" && restaurant.within_5km ? "success" : "neutral"}>
                      {restaurant.status === "closed"
                        ? "Orders Closed"
                        : restaurant.within_5km
                        ? "Delivery Available"
                        : "Outside Area"}
                    </Badge>
                  </div>
                  <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 px-3 py-1 text-xs font-bold text-slate-800 shadow-sm backdrop-blur-sm">
                    📍 {restaurant.distance_km} km from you
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                      {restaurant.name}
                    </h1>
                    <div className="flex items-center gap-2">
                      <Badge tone="success">
                        {restaurant.rating > 0 ? `★ ${restaurant.rating}` : "★ New"}
                      </Badge>
                    </div>
                  </div>

                  {/* Rating & Orders */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 rounded-2xl border border-black/5 bg-slate-50 p-4 text-xs">
                    <div>
                      <p className="text-slate-500 font-medium">Customer Rating</p>
                      <p className="text-base font-bold text-slate-900">
                        {restaurant.rating > 0 ? `${restaurant.rating} / 5.0` : "New"}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {restaurant.review_count} {restaurant.review_count === 1 ? "review" : "reviews"}
                      </p>
                    </div>

                    <div className="border-l border-black/10 pl-3">
                      <p className="text-slate-500 font-medium">Orders</p>
                      <p className="text-base font-bold text-amber-700">
                        {restaurant.people_ordered_count} customers
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {restaurant.total_orders_count} {restaurant.total_orders_count === 1 ? "order" : "orders"} placed
                      </p>
                    </div>

                    <div className="border-l border-black/10 pl-3 col-span-2 sm:col-span-1">
                      <p className="text-slate-500 font-medium">Opening Hours</p>
                      <p className="text-xs font-bold text-slate-800">
                        {restaurant.open_time?.slice(0, 5)} - {restaurant.close_time?.slice(0, 5)}
                      </p>
                      <p className="text-[11px] text-emerald-600 font-medium">Doorstep Delivery</p>
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Menu Categories and Dishes */}
              {Object.keys(foodsByCategory).length === 0 ? (
                <Panel className="p-8 text-center text-sm text-slate-500">
                  This restaurant does not have any dishes listed on their menu yet.
                </Panel>
              ) : (
                Object.entries(foodsByCategory).map(([category, items]) => (
                  <section key={category} className="space-y-4">
                    <SectionHeading eyebrow="Menu" title={category.toUpperCase()} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      {items.map((food) => (
                        <Panel key={food.food_id} className="space-y-3 p-4 flex flex-col justify-between">
                          <div className="space-y-2">
                            <div className="relative flex h-24 w-full items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-slate-100 border border-black/5">
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-xl">🍲</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                  {food.category}
                                </span>
                              </div>
                              {food.discount > 0 && (
                                <div className="absolute top-2 right-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                                  {food.discount}% OFF
                                </div>
                              )}
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-bold text-slate-900 leading-snug">{food.name}</h3>
                                <div className="text-right shrink-0">
                                  <span className="font-bold text-slate-900 text-sm">৳{food.discounted_price}</span>
                                  {food.discount > 0 && (
                                    <span className="block text-[11px] text-slate-400 line-through">
                                      ৳{food.price}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {food.description && (
                                <p className="text-xs text-slate-500 line-clamp-2">{food.description}</p>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 flex items-center justify-between border-t border-black/5">
                            <button
                              type="button"
                              onClick={() => setSelectedFood(food)}
                              className="text-xs font-semibold text-amber-700 hover:underline"
                            >
                              View Details
                            </button>

                            {restaurant.status === "closed" ? (
                              <button
                                type="button"
                                disabled
                                className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 cursor-not-allowed"
                                title="This restaurant is currently closed off"
                              >
                                <span>🔒 Closed</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddToCart(food.food_id, 1)}
                                className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
                              >
                                <span>+ Add</span>
                              </button>
                            )}
                          </div>
                        </Panel>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>

            {/* Right Column: Cart Summary */}
            <div className="space-y-6">
              <Panel className="space-y-4 p-6 sticky top-6">
                <div className="flex items-center justify-between border-b border-black/5 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Your Cart</h2>
                    <p className="text-xs text-slate-500">
                      {cart && cart.restaurant_name ? `From: ${cart.restaurant_name}` : "No items added yet"}
                    </p>
                  </div>

                  {cart && cart.items.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteCart}
                      disabled={isDeletingCart}
                      title="Clear current cart"
                      className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
                    >
                      {isDeletingCart ? "Clearing..." : "🗑️ Clear Cart"}
                    </button>
                  )}
                </div>

                {!cart || cart.items.length === 0 ? (
                  <div className="rounded-2xl border border-black/5 bg-slate-50/80 p-6 text-center space-y-2">
                    <p className="text-xs font-semibold text-slate-700">Your basket is currently empty</p>
                    <p className="text-[11px] text-slate-400">
                      Select dishes from the menu to start building your order.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.items.map((item) => (
                      <div
                        key={item.food_id}
                        className="flex items-center justify-between rounded-xl border border-black/5 bg-slate-50 p-3 text-xs"
                      >
                        <div className="space-y-0.5 max-w-[50%]">
                          <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                          <p className="text-slate-500">৳{item.unit_price} each</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center rounded-full border border-black/10 bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.food_id, item.quantity - 1)}
                              className="px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-l-full"
                            >
                              -
                            </button>
                            <span className="px-2 text-xs font-bold text-slate-900">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.food_id, item.quantity + 1)}
                              className="px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-r-full"
                            >
                              +
                            </button>
                          </div>

                          <span className="font-bold text-slate-900 min-w-10 text-right">
                            ৳{item.item_total}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.food_id)}
                            className="text-xs text-red-500 hover:text-red-700"
                            title="Remove item"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="border-t border-black/5 pt-3 space-y-1.5 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>৳{cart.subtotal}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Delivery fee</span>
                        <span>৳{cart.delivery_fee}</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 text-sm pt-2 border-t border-black/5">
                        <span>Total Amount</span>
                        <span className="text-amber-700">৳{cart.total}</span>
                      </div>
                    </div>

                    {restaurant.status === "closed" && cart.restaurant_name === restaurant.name ? (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          disabled
                          className="mt-2 block w-full rounded-full bg-slate-200 px-4 py-2.5 text-center text-xs font-semibold text-slate-500 cursor-not-allowed"
                        >
                          🔒 Checkout Disabled (Closed)
                        </button>
                        <p className="text-[11px] text-center text-rose-600 font-medium">
                          This restaurant is currently closed off and not accepting orders.
                        </p>
                      </div>
                    ) : (
                      <Link
                        href="/checkout"
                        className="mt-2 block w-full rounded-full bg-amber-500 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-md shadow-amber-500/20 transition hover:bg-amber-600"
                      >
                        Proceed to Checkout →
                      </Link>
                    )}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        )}

        {/* Food Details Modal */}
        {selectedFood && (
          <Modal
            open={Boolean(selectedFood)}
            title={selectedFood.name}
            description="Dish details & kitchen info"
            onClose={() => setSelectedFood(null)}
          >
            <div className="space-y-4 text-xs text-slate-700">
              <div className="flex h-28 w-full items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-100 to-orange-50 border border-amber-200/60">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-3xl">🍲</span>
                  <span className="font-bold uppercase tracking-wider text-amber-900">{selectedFood.category}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-slate-900">{selectedFood.name}</span>
                  <div className="text-right">
                    <span className="text-base font-bold text-amber-700">৳{selectedFood.discounted_price}</span>
                    {selectedFood.discount > 0 && (
                      <span className="ml-1 text-xs text-slate-400 line-through">৳{selectedFood.price}</span>
                    )}
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed">
                  {selectedFood.description || "Freshly cooked to order using quality ingredients."}
                </p>
              </div>

              <div className="rounded-xl border border-black/5 bg-slate-50 p-3 space-y-1.5">
                <p className="font-semibold text-slate-900">Kitchen details:</p>
                <div className="flex justify-between">
                  <span className="text-slate-500">Restaurant:</span>
                  <span className="font-medium text-slate-800">{restaurant?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Distance:</span>
                  <span className="font-medium text-slate-800">{restaurant?.distance_km} km</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Rating:</span>
                  <span className="font-medium text-slate-800">★ {restaurant?.rating || "New"}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedFood(null)}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={restaurant?.status === "closed"}
                  onClick={() => {
                    if (restaurant?.status === "closed") return;
                    handleAddToCart(selectedFood.food_id, 1);
                    setSelectedFood(null);
                  }}
                  className={cn(
                    "rounded-full px-5 py-2 text-xs font-semibold transition",
                    restaurant?.status === "closed"
                      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : "bg-amber-500 text-white shadow-sm hover:bg-amber-600"
                  )}
                >
                  {restaurant?.status === "closed" ? "🔒 Restaurant Closed" : "Add to Cart"}
                </button>
              </div>
            </div>
          </Modal>
        )}

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
              Would you like to clear your existing basket and start a fresh order from <strong className="text-slate-900">{restaurant?.name}</strong>?
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
                Clear Cart & Add Item
              </button>
            </div>
          </div>
        </Modal>
      </AppShell>
    </CustomerAccessGuard>
  );
}
