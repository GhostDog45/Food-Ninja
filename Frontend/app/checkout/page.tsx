"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Modal } from "@/components/modal";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { customerNav } from "@/lib/platform";
import {
  apiGetUserCart,
  apiDeleteUserCart,
  apiCheckoutUserCart,
  apiUpdateCartItemQty,
  apiRemoveCartItem,
  apiGetUserRestaurantDetail,
  getAuthUser,
  getOnboardingDetails,
  type CartData,
} from "@/lib/backend";
import { useToast } from "@/components/toast-provider";
import { CustomerAccessGuard } from "@/components/customer-access-guard";

export default function CheckoutPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [savedArea, setSavedArea] = useState("");
  const [foodPreparingNotes, setFoodPreparingNotes] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isDeletingCart, setIsDeletingCart] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Live cart state from backend
  const [cart, setCart] = useState<CartData | null>(null);

  async function fetchCartData() {
    setIsLoading(true);
    try {
      const res = await apiGetUserCart();
      setCart(res.cart);
    } catch {
      setCart(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const user = getAuthUser();
    if (user) {
      const details = getOnboardingDetails(user.username);
      if (details?.area) {
        setSavedArea(String(details.area));
      }
    }
    fetchCartData();
  }, []);

  async function handleUpdateQty(foodId: string, qty: number) {
    try {
      await apiUpdateCartItemQty(foodId, qty);
      fetchCartData();
    } catch (err: any) {
      toast(err.message || "Failed to update quantity", "danger");
    }
  }

  async function handleRemoveItem(foodId: string) {
    try {
      await apiRemoveCartItem(foodId);
      toast("Dish removed from cart", "default");
      fetchCartData();
    } catch (err: any) {
      toast(err.message || "Failed to remove dish", "danger");
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

  async function handleConfirmOrder() {
    if (!cart || cart.items.length === 0) {
      toast("Your cart is empty.", "warning");
      return;
    }

    setIsPlacingOrder(true);

    // Final Stage Client-Side Check: Dynamically re-verify restaurant operating status
    try {
      const freshRes = await apiGetUserRestaurantDetail(cart.restaurant_id);
      if (freshRes.status !== "open") {
        toast(
          `'${cart.restaurant_name}' has closed since you added items to your cart. Your order cannot be placed.`,
          "danger"
        );
        setCart((prev) => (prev ? { ...prev, restaurant_status: "closed" } : null));
        setOpen(false);
        setIsPlacingOrder(false);
        return;
      }
    } catch (err: any) {
      toast(
        err.message || `'${cart.restaurant_name}' is currently unavailable. Order cannot be placed.`,
        "danger"
      );
      setOpen(false);
      setIsPlacingOrder(false);
      return;
    }

    try {
      const res = await apiCheckoutUserCart({
        payment_method: "Cash on delivery",
        food_preparing_notes: foodPreparingNotes.trim() || undefined,
        delivery_notes: deliveryNotes.trim() || undefined,
      });

      const etaNotice = res.delivery_estimate?.delivery_time_range
        ? ` Est. delivery: ${res.delivery_estimate.delivery_time_range}`
        : "";
      toast(`Order placed successfully!${etaNotice}`, "success");
      setOpen(false);

      setTimeout(() => {
        router.push(`/orders/${res.order_id}`);
      }, 500);
    } catch (err: any) {
      toast(err.message || "Failed to place order. Please try again.", "danger");
      setIsPlacingOrder(false);
    }
  }

  const items = cart?.items || [];
  const subtotal = cart?.subtotal || 0;
  const deliveryFee = cart?.delivery_fee || 0;
  const totalBill = cart?.total || 0;

  return (
    <CustomerAccessGuard>
      <AppShell
        role="Customer portal"
        title="Checkout"
        subtitle="Review your order items, provide cooking and delivery instructions, and confirm your order."
        nav={customerNav}
        actions={
          <Badge tone="primary">Secure Checkout</Badge>
        }
      >
        {cart?.restaurant_status === "closed" && (
          <div className="mb-6 rounded-2xl border border-rose-300 bg-rose-50/95 p-4 sm:p-5 text-rose-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-lg">
                🔒
              </div>
              <div>
                <h4 className="text-sm font-bold text-rose-950">Restaurant is Currently Closed Off</h4>
                <p className="text-xs text-rose-800 mt-0.5">
                  <strong>{cart.restaurant_name}</strong> is currently closed and not accepting orders. You cannot place this order until the restaurant reopens.
                </p>
              </div>
            </div>
            <div className="sm:shrink-0">
              <button
                type="button"
                onClick={handleDeleteCart}
                className="rounded-full bg-rose-200 px-3.5 py-1.5 text-xs font-bold text-rose-900 hover:bg-rose-300 transition"
              >
                Clear Cart
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
          {/* Left Column: Cart Review */}
          <Panel className="space-y-5 p-6">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div>
                <SectionHeading eyebrow="Order Review" title="Selected Items" />
                {cart?.restaurant_name && (
                  <p className="text-xs text-amber-700 font-medium mt-1">
                    Ordering from: <strong>{cart.restaurant_name}</strong>
                  </p>
                )}
              </div>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteCart}
                  disabled={isDeletingCart}
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
                >
                  {isDeletingCart ? "Clearing..." : "🗑️ Clear Cart"}
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading your cart...</div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-black/5 bg-slate-50/80 p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-800">Your basket is currently empty</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Explore nearby restaurants to add freshly prepared dishes to your cart.
                </p>
                <Link
                  href="/home"
                  className="inline-flex items-center rounded-full bg-amber-500 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition"
                >
                  Browse Restaurants →
                </Link>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-slate-700">
                {items.map((item) => (
                  <div
                    key={item.food_id}
                    className="flex items-center justify-between rounded-2xl border border-black/5 bg-slate-50 p-4"
                  >
                    <div className="space-y-0.5 max-w-[50%]">
                      <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                      <p className="text-xs text-slate-500">৳{item.unit_price} each</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center rounded-full border border-black/10 bg-white">
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

                      <span className="font-bold text-slate-900 min-w-12 text-right">
                        ৳{item.item_total}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.food_id)}
                        className="text-xs text-red-500 hover:text-red-700"
                        title="Remove dish"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}

                <div className="border-t border-black/5 pt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal</span>
                    <span>৳{subtotal}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Delivery fee</span>
                    <span>৳{deliveryFee}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 text-sm pt-2 border-t border-black/5">
                    <span>Total Amount</span>
                    <span className="text-amber-700 text-base">৳{totalBill}</span>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {/* Right Column: Instructions & Payment */}
          <div className="space-y-6">
            <Panel className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <SectionHeading eyebrow="Preferences" title="Order Instructions" />
                <Badge tone="success">Saved Location</Badge>
              </div>

              <div className="rounded-2xl border border-black/5 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <span>📍</span>
                  <span>Delivery Destination</span>
                </div>
                <p className="text-slate-600 pl-6">
                  {savedArea ? `${savedArea}, Dhaka` : "Using your saved account GPS location"}
                </p>
              </div>

              <label className="space-y-1.5 text-xs font-semibold text-slate-700 block">
                <span>Food Preparing Instructions (Optional)</span>
                <textarea
                  value={foodPreparingNotes}
                  onChange={(e) => setFoodPreparingNotes(e.target.value)}
                  placeholder="e.g. Less spicy, no onions, extra sauce, well cooked..."
                  rows={2}
                  className="w-full rounded-2xl border border-black/10 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 resize-none"
                />
              </label>

              <label className="space-y-1.5 text-xs font-semibold text-slate-700 block">
                <span>Delivery Instructions (Optional)</span>
                <textarea
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="e.g. Leave at apartment reception, ring bell twice, call upon arrival..."
                  rows={2}
                  className="w-full rounded-2xl border border-black/10 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 resize-none"
                />
              </label>
            </Panel>

            <Panel className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <SectionHeading eyebrow="Payment" title="Payment Method" />
                <Badge tone="success">Cash on Delivery</Badge>
              </div>

              <div className="rounded-2xl border-2 border-amber-500 bg-amber-50/70 p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">💵</span>
                    <span className="font-bold text-slate-900 text-sm">Cash on Delivery</span>
                  </div>
                  <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-white">
                    Selected
                  </span>
                </div>
                <p className="text-xs text-slate-600 pl-8">
                  Pay in cash when your order arrives at your doorstep.
                </p>
              </div>

              <div className="rounded-xl border border-black/5 bg-slate-50 p-3 text-[11px] text-slate-500">
                💵 Please have the exact amount ready upon delivery.
              </div>

              <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={items.length === 0 || cart?.restaurant_status === "closed"}
                className="w-full rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-amber-500/25 transition hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cart?.restaurant_status === "closed" ? "🔒 Restaurant Closed" : `Place Order (৳${totalBill})`}
              </button>
            </Panel>
          </div>
        </div>

        {/* Order Confirmation Modal */}
        <Modal
          open={open}
          title="Confirm Your Order"
          description="Please verify your delivery details before final dispatch."
          onClose={() => setOpen(false)}
        >
          <div className="space-y-4 text-sm text-slate-700">
            <div className="rounded-2xl border border-black/5 bg-slate-50 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Restaurant:</span>
                <span className="font-semibold text-slate-900">{cart?.restaurant_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Destination:</span>
                <span className="font-semibold text-slate-900 text-right max-w-[60%] truncate">
                  {savedArea ? `${savedArea}, Dhaka` : "Saved Account Location"}
                </span>
              </div>
              {foodPreparingNotes.trim() && (
                <div className="flex justify-between border-t border-black/5 pt-1.5">
                  <span className="text-slate-500">Food Prep:</span>
                  <span className="font-medium text-slate-900 text-right max-w-[60%] truncate">
                    {foodPreparingNotes.trim()}
                  </span>
                </div>
              )}
              {deliveryNotes.trim() && (
                <div className="flex justify-between border-t border-black/5 pt-1.5">
                  <span className="text-slate-500">Delivery Note:</span>
                  <span className="font-medium text-slate-900 text-right max-w-[60%] truncate">
                    {deliveryNotes.trim()}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Payment:</span>
                <span className="font-semibold text-slate-900">Cash on Delivery</span>
              </div>
              <div className="flex justify-between border-t border-black/5 pt-2 font-bold text-sm">
                <span>Total Payable:</span>
                <span className="text-amber-700">৳{totalBill}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Modify
              </button>
              <button
                type="button"
                onClick={handleConfirmOrder}
                disabled={isPlacingOrder}
                className="rounded-full bg-amber-500 px-6 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition disabled:opacity-50"
              >
                {isPlacingOrder ? "Placing Order..." : "Confirm & Place Order"}
              </button>
            </div>
          </div>
        </Modal>
      </AppShell>
    </CustomerAccessGuard>
  );
}
