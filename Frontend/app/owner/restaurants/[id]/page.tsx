"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { ownerNav } from "@/lib/platform";
import {
  apiAddFood,
  apiCancelOwnerOrder,
  apiDeleteFood,
  apiGetFoodCategories,
  apiGetOwnerRestaurantDetail,
  apiGetOwnerRestaurantOrders,
  apiUpdateOwnerFood,
  apiUpdateOwnerRestaurant,
  apiUploadFoodPicture,
  getImageUrl,
  type OwnerFood,
  type OwnerOrder,
  type OwnerRestaurant,
} from "@/lib/backend";

export default function OwnerRestaurantDetailPage() {
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<OwnerRestaurant | null>(null);
  const [foods, setFoods] = useState<OwnerFood[]>([]);
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"open" | "closed" | "shutdown">("closed");
  const [categories, setCategories] = useState<string[]>([]);
  const [uploadingFoodId, setUploadingFoodId] = useState<string | null>(null);
  const [newFood, setNewFood] = useState({
    name: "",
    category: "",
    subcategory: "",
    price: "",
    discount: "0",
    description: "",
  });

  async function load() {
    try {
      const [data, restaurantOrders] = await Promise.all([
        apiGetOwnerRestaurantDetail(params.id),
        apiGetOwnerRestaurantOrders(params.id),
      ]);
      setRestaurant(data.restaurant);
      setFoods(data.foods);
      setOrders(restaurantOrders);
      setStatus(
        data.restaurant.status === "shutdown"
          ? "shutdown"
          : data.restaurant.status === "open"
          ? "open"
          : "closed"
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to load restaurant", "danger");
    } finally {
      setLoading(false);
    }
  }

  const loadRestaurantData = useEffectEvent(() => {
    void load();
    void apiGetFoodCategories().then(setCategories);
  });

  useEffect(() => {
    loadRestaurantData();
  }, [params.id]);

  async function save() {
    if (!restaurant) return;
    try {
      await apiUpdateOwnerRestaurant(params.id, {
        open_time: restaurant.open_time,
        close_time: restaurant.close_time,
        status,
      });
      toast("Restaurant updated", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to update restaurant", "danger");
    }
  }

  async function removeFood(foodId: string) {
    if (!confirm("Are you sure you want to remove this food item?")) return;
    try {
      await apiDeleteFood(params.id, foodId);
      toast("Food removed", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to remove food", "danger");
    }
  }

  async function editFood(food: OwnerFood) {
    const name = window.prompt("Food name", food.name);
    if (name === null) return;
    const price = window.prompt("Price (৳)", String(food.price));
    if (price === null) return;
    const discount = window.prompt("Discount percent (%)", String(food.discount));
    if (discount === null) return;
    const description = window.prompt("Description", food.description || "");
    if (description === null) return;

    try {
      await apiUpdateOwnerFood(params.id, food.food_id, {
        name,
        price: Number(price),
        discount: Number(discount),
        description,
        subcategory: food.subcategory || "",
      });
      toast("Food updated", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to update food", "danger");
    }
  }

  async function handleFoodImageUpload(foodId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast(
        `Picture exceeds 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select an image under 5 MB.`,
        "danger"
      );
      e.target.value = "";
      return;
    }

    setUploadingFoodId(foodId);
    try {
      const res = await apiUploadFoodPicture(params.id, foodId, file);
      toast(res.message || "Food picture uploaded!", "success");
      setFoods((prev) =>
        prev.map((f) => (f.food_id === foodId ? { ...f, picture_url: res.picture_url } : f))
      );
    } catch (err: any) {
      toast(err.message || "Failed to upload food picture", "danger");
    } finally {
      setUploadingFoodId(null);
      e.target.value = "";
    }
  }

  async function cancelOrder(orderId: string) {
    try {
      await apiCancelOwnerOrder(params.id, orderId);
      toast("Order cancelled", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to cancel order", "danger");
    }
  }

  async function addFood(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiAddFood(params.id, {
        ...newFood,
        price: Number(newFood.price),
        discount: Number(newFood.discount),
      });
      setNewFood({
        name: "",
        category: "",
        subcategory: "",
        price: "",
        discount: "0",
        description: "",
      });
      toast("Food added successfully", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to add food", "danger");
    }
  }

  if (loading) {
    return (
      <AppShell role="Restaurant Owner" title="Restaurant details" subtitle="Loading..." nav={ownerNav}>
        <Panel className="p-8 text-center text-slate-500">Loading restaurant management...</Panel>
      </AppShell>
    );
  }

  if (!restaurant) {
    return (
      <AppShell role="Restaurant Owner" title="Restaurant details" subtitle="Unavailable" nav={ownerNav}>
        <Panel className="p-8 text-center text-slate-500">Restaurant not found.</Panel>
      </AppShell>
    );
  }

  const grouped = foods.reduce<Record<string, OwnerFood[]>>((groups, food) => {
    const key = food.subcategory || "Other";
    (groups[key] ||= []).push(food);
    return groups;
  }, {});

  return (
    <AppShell
      role="Restaurant Owner"
      title={restaurant.name}
      subtitle="Edit restaurant operations, food pictures, menu, and customer orders."
      nav={ownerNav}
    >
      <div className="space-y-6">
        {/* Restaurant Operations & Cover Picture Panel */}
        <Panel className="space-y-5 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <SectionHeading eyebrow="Restaurant details" title={restaurant.name} />
            <Badge
              tone={
                restaurant.status === "banned"
                  ? "danger"
                  : status === "open"
                  ? "success"
                  : status === "shutdown"
                  ? "warning"
                  : "neutral"
              }
            >
              {restaurant.status === "banned"
                ? "Banned"
                : status === "shutdown"
                ? "Shutdown"
                : status === "open"
                ? "Open"
                : "Closed"}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Open time
              <input
                type="time"
                value={restaurant.open_time.slice(0, 5)}
                onChange={(event) =>
                  setRestaurant({ ...restaurant, open_time: `${event.target.value}:00` })
                }
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-slate-900"
                disabled={restaurant.status === "banned"}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Close time
              <input
                type="time"
                value={restaurant.close_time.slice(0, 5)}
                onChange={(event) =>
                  setRestaurant({ ...restaurant, close_time: `${event.target.value}:00` })
                }
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-slate-900"
                disabled={restaurant.status === "banned"}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-black/5">
            <button
              type="button"
              onClick={() => {
                const next = status === "open" ? "closed" : "open";
                setStatus(next);
                void apiUpdateOwnerRestaurant(params.id, {
                  open_time: restaurant.open_time,
                  close_time: restaurant.close_time,
                  status: next,
                })
                  .then(load)
                  .catch((error) => toast(error.message, "danger"));
              }}
              disabled={restaurant.status === "banned"}
              className="rounded-full bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition"
            >
              {status === "open" ? "Force close" : "Force open"}
            </button>
            <button
              type="button"
              onClick={() => {
                const next = status === "shutdown" ? "closed" : "shutdown";
                setStatus(next);
                void apiUpdateOwnerRestaurant(params.id, {
                  open_time: restaurant.open_time,
                  close_time: restaurant.close_time,
                  status: next,
                })
                  .then(load)
                  .catch((error) => toast(error.message, "danger"));
              }}
              disabled={restaurant.status === "banned"}
              className="rounded-full bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-semibold text-white transition"
            >
              {status === "shutdown" ? "Reopen restaurant" : "Shutdown"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={restaurant.status === "banned"}
              className="rounded-full border border-black/10 bg-slate-50 hover:bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 transition"
            >
              Save hours
            </button>
          </div>
        </Panel>

        {/* Menu & Food Items Panel with Picture Uploads */}
        <Panel className="space-y-6 p-6">
          <SectionHeading
            eyebrow="Menu management"
            title="Food Items & Pictures"
            description="Upload mouth-watering pictures for each food item (max 5 MB). Uploads reflect immediately."
          />

          {Object.keys(grouped).length === 0 ? (
            <p className="text-sm text-slate-500">No food items added yet.</p>
          ) : (
            Object.entries(grouped).map(([subcategory, items]) => (
              <section key={subcategory} className="space-y-3">
                <h3 className="font-bold text-slate-800 text-sm border-b pb-1">{subcategory}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((food) => (
                    <div
                      key={food.food_id}
                      className="rounded-2xl border border-black/10 bg-slate-50/70 p-3.5 flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-2">
                        {/* Food Image thumbnail & upload button */}
                        <div className="relative h-32 w-full rounded-xl overflow-hidden bg-slate-200 border border-black/5 flex items-center justify-center group">
                          {food.picture_url ? (
                            <Image
                              src={getImageUrl(food.picture_url)}
                              alt={food.name}
                              width={320}
                              height={128}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-slate-400">
                              <span className="text-2xl">🍲</span>
                              <span className="text-[10px]">No image</span>
                            </div>
                          )}

                          {uploadingFoodId === food.food_id && (
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white text-[11px] font-semibold">
                              <span className="animate-spin text-base">⏳</span>
                              <span>Uploading...</span>
                            </div>
                          )}

                          {/* Quick upload photo overlay button */}
                          <label className="absolute bottom-2 right-2 cursor-pointer inline-flex items-center gap-1 rounded-full bg-black/70 hover:bg-black text-white px-2.5 py-1 text-[11px] font-semibold shadow-xs backdrop-blur-xs transition">
                            <span>📷</span> {food.picture_url ? "Change" : "Upload"}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              onChange={(e) => handleFoodImageUpload(food.food_id, e)}
                              disabled={uploadingFoodId === food.food_id}
                              className="hidden"
                            />
                          </label>
                        </div>

                        <div>
                          <div className="flex items-start justify-between gap-1">
                            <h4 className="font-bold text-slate-900 text-sm">{food.name}</h4>
                            <span className="text-xs font-bold text-amber-700 shrink-0">৳{food.price}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {food.category} · {food.discount}% off
                          </p>
                          {food.description && (
                            <p className="text-xs text-slate-600 line-clamp-2 mt-1">{food.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-black/5">
                        <button
                          type="button"
                          onClick={() => editFood(food)}
                          className="text-xs font-semibold text-amber-700 hover:underline"
                        >
                          Edit Details
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFood(food.food_id)}
                          className="text-xs font-semibold text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}

          {/* Add Food Form */}
          <div className="border-t pt-5 space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Add New Food Item</h4>
            <form onSubmit={addFood} className="grid gap-3 sm:grid-cols-2">
              <input
                required
                placeholder="Food name"
                value={newFood.name}
                onChange={(event) => setNewFood({ ...newFood, name: event.target.value })}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
              />
              <select
                required
                value={newFood.category}
                onChange={(event) => setNewFood({ ...newFood, category: event.target.value })}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
              >
                <option value="">Select Category</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <input
                placeholder="Subcategory (e.g. Burgers, Drinks, Platters)"
                value={newFood.subcategory}
                onChange={(event) => setNewFood({ ...newFood, subcategory: event.target.value })}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
              />
              <input
                required
                type="number"
                min="0"
                step="0.01"
                placeholder="Price (৳)"
                value={newFood.price}
                onChange={(event) => setNewFood({ ...newFood, price: event.target.value })}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
              />
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Discount %"
                value={newFood.discount}
                onChange={(event) => setNewFood({ ...newFood, discount: event.target.value })}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
              />
              <input
                placeholder="Description"
                value={newFood.description}
                onChange={(event) => setNewFood({ ...newFood, description: event.target.value })}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
              />
              <button
                type="submit"
                className="rounded-full bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white sm:col-span-2 transition shadow-xs"
              >
                Add Food Item
              </button>
            </form>
          </div>
        </Panel>

        {/* Restaurant Orders Panel */}
        <Panel className="space-y-4 p-6">
          <SectionHeading eyebrow="Restaurant orders" title="Live Customer Orders" />
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500">No active or historical orders for this restaurant.</p>
          ) : (
            orders.map((order) => (
              <div
                key={order.order_id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {order.customer_name} · <span className="font-mono text-xs">{order.order_id}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    <span className="font-semibold capitalize text-amber-700">{order.status}</span> ·{" "}
                    {new Date(order.order_timestamp).toLocaleString()} · {order.customer_phone}
                  </p>
                </div>
                {order.status === "pending" && !order.rider_username && (
                  <button
                    type="button"
                    onClick={() => cancelOrder(order.order_id)}
                    className="rounded-full bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition"
                  >
                    Cancel Order
                  </button>
                )}
              </div>
            ))
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
