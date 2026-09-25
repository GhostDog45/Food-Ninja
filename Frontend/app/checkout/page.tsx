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
  const [address, setAddress] = useState("");
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
        setAddress(String(details.area));
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

    if (!address.trim()) {
      toast("Please enter your delivery address.", "warning");
      return;
    }

    setIsPlacingOrder(true);

    try {
      const res = await apiCheckoutUserCart({
        payment_method: "Cash on delivery",
      });

      toast("Order placed successfully!", "success");
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
        subtitle="Review your order items, confirm destination address, and pay via Cash on Delivery."
        nav={customerNav}
        actions={
          <Badge tone="primary">Secure Checkout</Badge>
        }
      >
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

          {/* Right Column: Address & Payment */}
          <div className="space-y-6">
            <Panel className="space-y-4 p-6">
              <SectionHeading eyebrow="Delivery" title="Delivery Address & Instructions" />
              <label className="space-y-1.5 text-xs font-semibold text-slate-700 block">
                <span>Street Address / Area in Dhaka *</span>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter house, road, area, Dhaka (e.g. Dhanmondi, Gulshan, Mirpur)"
                  className="w-full rounded-2xl border border-black/10 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
                  required
                />
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-700 block">
                <span>Delivery Instructions (Optional)</span>
                <textarea
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="e.g. Leave at apartment reception, call upon arrival..."
                  className="min-h-20 w-full rounded-2xl border border-black/10 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 resize-none"
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
                disabled={items.length === 0}
                className="w-full rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-amber-500/25 transition hover:bg-amber-600 disabled:opacity-40"
              >
                Place Order (৳{totalBill})
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
                  {address || "Not specified"}
                </span>
              </div>
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
