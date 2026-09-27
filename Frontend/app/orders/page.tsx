"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading, TableFrame } from "@/components/ui";
import { Modal } from "@/components/modal";
import { customerNav } from "@/lib/platform";
import {
  apiGetUserOrders,
  apiSubmitOrderReview,
  apiCancelUserOrder,
  type CustomerOrder,
} from "@/lib/backend";
import { useToast } from "@/components/toast-provider";
import { CustomerAccessGuard } from "@/components/customer-access-guard";

function StarRating({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange?: (val: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = hover ? star <= hover : star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange && onChange(star)}
            onMouseEnter={() => !disabled && setHover(star)}
            onMouseLeave={() => !disabled && setHover(0)}
            className={`text-xl transition-transform ${
              disabled ? "cursor-default" : "cursor-pointer hover:scale-115"
            } ${filled ? "text-amber-500" : "text-slate-300"}`}
          >
            ★
          </button>
        );
      })}
      <span className="ml-1.5 text-xs font-bold text-slate-700">
        {value > 0 ? `${value}/5` : "Select rating"}
      </span>
    </div>
  );
}

function extractSumTotal(bill?: string): string {
  if (!bill) return "0";
  const match = bill.match(/Sum total\s*=\s*([0-9.]+)/i);
  if (match) return match[1];
  const trimmed = bill.trim();
  if (/^[0-9.]+$/.test(trimmed)) return trimmed;
  const match2 = bill.match(/Total\s*=\s*([0-9.]+)/i);
  if (match2) return match2[1];
  return bill;
}

export default function OrderHistoryPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "delivered">("all");
  const [receiptModalOrder, setReceiptModalOrder] = useState<CustomerOrder | null>(null);

  // Review modal state
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [restaurantRating, setRestaurantRating] = useState<number>(5);
  const [restaurantReview, setRestaurantReview] = useState<string>("");
  const [riderRating, setRiderRating] = useState<number>(5);
  const [riderReview, setRiderReview] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Cancellation modal state
  const [cancellingOrder, setCancellingOrder] = useState<CustomerOrder | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  async function handleConfirmCancel() {
    if (!cancellingOrder) return;
    setIsCancelling(true);
    try {
      await apiCancelUserOrder(cancellingOrder.order_id);
      toast("Order cancelled successfully.", "success");
      setCancellingOrder(null);
      await fetchOrders();
    } catch (err: any) {
      toast(err.message || "Failed to cancel order.", "danger");
    } finally {
      setIsCancelling(false);
    }
  }


  async function fetchOrders() {
    setIsLoading(true);
    try {
      const data = await apiGetUserOrders();
      const uniqueMap = new Map<string, CustomerOrder>();
      for (const item of data) {
        if (!uniqueMap.has(item.order_id)) {
          uniqueMap.set(item.order_id, item);
        }
      }
      setOrders(Array.from(uniqueMap.values()));
    } catch {
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, []);

  function handleOpenReview(order: CustomerOrder) {
    setSelectedOrder(order);
    setRestaurantRating(order.review?.restaurant_rating || 5);
    setRestaurantReview(order.review?.restaurant_review || "");
    setRiderRating(order.review?.rider_rating || 5);
    setRiderReview(order.review?.rider_review || "");
    setIsReviewModalOpen(true);
  }

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;

    if (!restaurantRating || restaurantRating < 1) {
      toast("Please select a restaurant rating (1-5 stars).", "warning");
      return;
    }

    setIsSubmittingReview(true);
    try {
      await apiSubmitOrderReview(selectedOrder.order_id, {
        restaurant_rating: restaurantRating,
        restaurant_review: restaurantReview.trim() || undefined,
        rider_rating: selectedOrder.rider_name ? riderRating : undefined,
        rider_review: selectedOrder.rider_name ? riderReview.trim() || undefined : undefined,
      });

      toast("Your review has been saved to the database. Thank you!", "success");
      setIsReviewModalOpen(false);

      // Optimistically update orders list
      setOrders((prev) =>
        prev.map((o) => {
          if (o.order_id === selectedOrder.order_id) {
            return {
              ...o,
              review: {
                restaurant_rating: restaurantRating,
                restaurant_review: restaurantReview.trim() || null,
                rider_rating: selectedOrder.rider_name ? riderRating : null,
                rider_review: selectedOrder.rider_name ? riderReview.trim() || null : null,
                timestamp: new Date().toISOString(),
              },
            };
          }
          return o;
        })
      );
    } catch (err: any) {
      toast(err.message || "Failed to submit review.", "danger");
    } finally {
      setIsSubmittingReview(false);
    }
  }

  const filteredOrders = orders.filter((o) => {
    if (filter === "active") {
      return o.status === "pending" || o.status === "delivering";
    }
    if (filter === "delivered") {
      return o.status === "delivered" || o.status === "cancelled" || o.status === "rejected";
    }
    return true;
  });

  const activeCount = orders.filter(
    (o) => o.status === "pending" || o.status === "delivering"
  ).length;
  const deliveredCount = orders.filter((o) => o.status === "delivered" || o.status === "cancelled" || o.status === "rejected").length;

  return (
    <CustomerAccessGuard>
      <AppShell
        role="Customer portal"
        title="Order History"
        subtitle="Track active deliveries, browse your completed past orders, and review restaurants and riders."
        nav={customerNav}
        actions={
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => setFilter("active")}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-500/20 transition cursor-pointer"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{activeCount} Active Delivery</span>
              </button>
            )}
            <Badge tone="primary">{orders.length} Total Orders</Badge>
          </div>
        }
      >
        <div className="space-y-6 max-w-5xl">
          {/* Header filter controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 rounded-2xl border border-black/10 bg-white p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition ${
                  filter === "all"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Orders ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("active")}
                className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
                  filter === "active"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {activeCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                Active ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter("delivered")}
                className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition ${
                  filter === "delivered"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Delivered / Past ({deliveredCount})
              </button>
            </div>

            <button
              type="button"
              onClick={fetchOrders}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shrink-0"
            >
              <span>{isLoading ? "Refreshing..." : "🔄 Refresh"}</span>
            </button>
          </div>

          {/* Orders list */}
          {isLoading ? (
            <Panel className="p-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent mb-3" />
              <p className="text-xs font-medium text-slate-500">Loading your orders...</p>
            </Panel>
          ) : filteredOrders.length === 0 ? (
            <Panel className="p-12 text-center space-y-3">
              <div className="text-4xl">🥡</div>
              <h3 className="text-base font-bold text-slate-900">
                {filter === "active"
                  ? "No active deliveries right now"
                  : filter === "delivered"
                  ? "No delivered orders yet"
                  : "No orders placed yet"}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {filter === "all"
                  ? "Browse nearby restaurants and cuisines in Dhaka to place your first food order."
                  : "Your completed deliveries and order receipts will be organized here."}
              </p>
              <Link
                href="/home"
                className="inline-flex items-center rounded-full bg-amber-500 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition"
              >
                Browse Restaurants →
              </Link>
            </Panel>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => {
                const isActive =
                  order.status === "pending" ||
                  order.status === "delivering";
                const isDelivered = order.status === "delivered";
                const isRejected = order.status === "rejected";
                const hasReview = Boolean(order.review);

                return (
                  <Panel key={order.order_id} className="p-5 sm:p-6 space-y-4">
                    {/* Top Row: Restaurant Name, Order ID, Date, Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/5 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/restaurant/${order.restaurant_id}`}
                            className="text-base font-bold text-slate-900 hover:text-amber-700 transition flex items-center gap-1.5"
                          >
                            <span>🍽️</span>
                            <span>{order.restaurant_name}</span>
                          </Link>
                          <Badge
                            tone={
                              order.status === "delivered"
                                ? "success"
                                : order.status === "delivering"
                                ? "warning"
                                : order.status === "cancelled" || order.status === "rejected"
                                ? "danger"
                                : "primary"
                            }
                          >
                            {order.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Order ID: <span className="font-mono font-medium text-slate-700">{order.order_id}</span>
                          {order.order_timestamp && (
                            <span className="ml-2">· {new Date(order.order_timestamp).toLocaleString()}</span>
                          )}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-xs text-slate-500 block">Total Bill</span>
                        <span className="text-base font-bold text-amber-700">
                          ৳{order.total_amount || extractSumTotal(order.bill)}
                        </span>
                      </div>
                    </div>

                    {isRejected && (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                        Sorry, the restaurant closed or, due to unfortunate events, failed to prepare the food.
                      </p>
                    )}

                    {/* Middle Details: Courier, ETA & Payment */}
                    <div className="grid gap-3 sm:grid-cols-3 text-xs bg-slate-50/70 p-3 rounded-2xl border border-black/5">
                      <div>
                        <span className="text-slate-500 block font-medium">Assigned Courier:</span>
                        <p className="font-semibold text-slate-900 mt-0.5">
                          {order.rider_name ? (
                            <span className="flex items-center gap-1">
                              <span>{order.rider_vehicle === "bicycle" ? "🚲" : "🛵"}</span>
                              <span>{order.rider_name}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Pending rider dispatch</span>
                          )}
                        </p>
                      </div>

                      <div>
                        <span className="text-slate-500 block font-medium">Delivery Timeline:</span>
                        <p className="font-semibold text-slate-900 mt-0.5">
                          {isDelivered
                            ? `Delivered ${order.final_timestamp ? `at ${new Date(order.final_timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`
                            : order.delivery_estimate?.delivery_time_range || "25 - 35 mins"}
                        </p>
                      </div>

                      <div>
                        <span className="text-slate-500 block font-medium">Payment:</span>
                        <p className="font-semibold text-slate-900 mt-0.5">
                          {order.payment_method || "Cash on Delivery"}
                        </p>
                      </div>
                    </div>

                    {/* Existing Review or Review Prompt */}
                    {isDelivered && (
                      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                            <span>⭐</span>
                            <span>{hasReview ? "Customer Review on Record" : "Feedback & Rating"}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenReview(order)}
                            className="rounded-full bg-white border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100/70 transition shadow-2xs"
                          >
                            {hasReview ? "Edit Review" : "Give Review →"}
                          </button>
                        </div>

                        {hasReview ? (
                          <div className="grid gap-2 sm:grid-cols-2 text-xs pt-1">
                            <div className="rounded-xl bg-white p-3 border border-amber-100 shadow-2xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">Restaurant Quality:</span>
                                <span className="font-bold text-amber-600 flex items-center gap-0.5">
                                  <span>★</span> {order.review?.restaurant_rating}/5
                                </span>
                              </div>
                              {order.review?.restaurant_review && (
                                <p className="text-slate-600 text-[11px] italic mt-1">
                                  &quot;{order.review.restaurant_review}&quot;
                                </p>
                              )}
                            </div>

                            {order.review?.rider_rating && (
                              <div className="rounded-xl bg-white p-3 border border-amber-100 shadow-2xs space-y-1">
                                <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">Rider Delivery Service:</span>
                                <span className="font-bold text-amber-600 flex items-center gap-0.5">
                                  <span>★</span> {order.review?.rider_rating}/5
                                </span>
                              </div>
                              {order.review?.rider_review && (
                                <p className="text-slate-600 text-[11px] italic mt-1">
                                  &quot;{order.review.rider_review}&quot;
                                </p>
                              )}
                            </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-amber-800">
                            Your order was delivered! Please take a moment to rate the restaurant&apos;s food and your courier&apos;s service.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Bottom Action Buttons */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-black/5">
                      <div className="flex flex-wrap items-center gap-2">
                        {isActive && (
                          <>
                            <Link
                              href={`/orders/${order.order_id}`}
                              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-600 transition"
                            >
                              <span>🛵</span>
                              <span>Track Live Order</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => setCancellingOrder(order)}
                              className="rounded-full border border-rose-300 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs inline-flex items-center gap-1.5"
                            >
                              <span>✕</span>
                              <span>Cancel</span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => setReceiptModalOrder(order)}
                          className="rounded-full border border-black/10 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs inline-flex items-center gap-1.5"
                        >
                          <span>🧾</span>
                          <span>View Bill</span>
                        </button>
                      </div>

                      <Link
                        href={`/restaurant/${order.restaurant_id}`}
                        className="text-xs font-semibold text-amber-700 hover:underline"
                      >
                        Reorder from {order.restaurant_name} →
                      </Link>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </div>

        {/* Review Submission Modal */}
        <Modal
          open={isReviewModalOpen}
          title="Review Your Order"
          description={
            selectedOrder
              ? `Share your feedback for ${selectedOrder.restaurant_name} (Order ${selectedOrder.order_id}).`
              : "Share your rating and feedback."
          }
          onClose={() => setIsReviewModalOpen(false)}
        >
          <form onSubmit={handleSubmitReview} className="space-y-5 text-sm text-slate-800">
            {/* 1. Restaurant Rating & Review */}
            <div className="rounded-2xl border border-black/10 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>🍽️</span>
                  <span>Rate Restaurant ({selectedOrder?.restaurant_name})</span>
                </label>
                <StarRating
                  value={restaurantRating}
                  onChange={(val) => setRestaurantRating(val)}
                />
              </div>

              <textarea
                value={restaurantReview}
                onChange={(e) => setRestaurantReview(e.target.value)}
                placeholder="How was the taste, packaging, and portion size? (Optional)"
                rows={2}
                className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 resize-none"
              />
            </div>

            {/* 2. Rider Rating & Review (if a rider was assigned) */}
            <div className="rounded-2xl border border-black/10 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>🛵</span>
                  <span>Rate Rider {selectedOrder?.rider_name ? `(${selectedOrder.rider_name})` : ""}</span>
                </label>
                <StarRating
                  value={riderRating}
                  onChange={(val) => setRiderRating(val)}
                />
              </div>

              <textarea
                value={riderReview}
                onChange={(e) => setRiderReview(e.target.value)}
                placeholder="How was the delivery speed, navigation, and courier service? (Optional)"
                rows={2}
                className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 resize-none"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingReview}
                className="rounded-full bg-amber-500 px-6 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition disabled:opacity-50"
              >
                {isSubmittingReview ? "Submitting Review..." : "Submit Review"}
              </button>
            </div>
          </form>
        </Modal>

        {/* Printed Bill Receipt Modal */}
        <Modal
          open={Boolean(receiptModalOrder)}
          onClose={() => setReceiptModalOrder(null)}
          title="Official Restaurant Bill"
        >
          {receiptModalOrder && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 border-b border-black/5 pb-2">
                <span>Order #{receiptModalOrder.order_id}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(receiptModalOrder.bill);
                    toast("Receipt copied to clipboard!", "success");
                  }}
                  className="rounded-full border border-black/10 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition inline-flex items-center gap-1"
                >
                  <span>📋</span>
                  <span>Copy Receipt</span>
                </button>
              </div>

              <div className="rounded-xl border border-dashed border-slate-300 bg-amber-50/20 p-4 font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap select-all shadow-inner max-h-[60vh] overflow-y-auto">
                {receiptModalOrder.bill && receiptModalOrder.bill.includes("\n") ? (
                  receiptModalOrder.bill.replace(/\n\s*Desc:[^\n]*/g, "")
                ) : (
                  `Restaurant name: ${receiptModalOrder.restaurant_name}
Order ID: #${receiptModalOrder.order_id}
Timestamp: ${receiptModalOrder.order_timestamp || "N/A"}
Payment: ${receiptModalOrder.payment_method || "Cash on Delivery"}

Sum total = ${receiptModalOrder.bill}`
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setReceiptModalOrder(null)}
                  className="rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
                >
                  Close Receipt
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Cancel Order Confirmation Modal */}
        <Modal
          open={Boolean(cancellingOrder)}
          onClose={() => setCancellingOrder(null)}
          title="Cancel Your Order"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Are you sure you want to cancel order <strong>#{cancellingOrder?.order_id}</strong> from <strong>{cancellingOrder?.restaurant_name}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isCancelling}
                onClick={() => setCancellingOrder(null)}
                className="rounded-full border border-black/10 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleConfirmCancel}
                className="rounded-full bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
              >
                {isCancelling ? "Cancelling..." : "Yes, Cancel Order"}
              </button>
            </div>
          </div>
        </Modal>
      </AppShell>
    </CustomerAccessGuard>
  );
}
