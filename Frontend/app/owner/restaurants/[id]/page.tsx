"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { ownerNav } from "@/lib/platform";
import { ImageCropModal, type CropAspectRatio } from "@/components/image-crop-modal";
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
  apiUploadRestaurantPicture,
  apiDeleteRestaurantPicture,
  getImageUrl,
  type OwnerFood,
  type OwnerOrder,
  type OwnerRestaurant,
} from "@/lib/backend";

function computeStatusFromSystemTime(
  openTimeStr?: string,
  closeTimeStr?: string,
  currentStatus: "open" | "closed" | "shutdown" = "closed"
): "open" | "closed" | "shutdown" {
  if (currentStatus === "shutdown") return "shutdown";
  if (!openTimeStr || !closeTimeStr) return currentStatus;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const [oH, oM] = openTimeStr.slice(0, 5).split(":").map(Number);
  const [cH, cM] = closeTimeStr.slice(0, 5).split(":").map(Number);
  const openMins = (oH || 0) * 60 + (oM || 0);
  const closeMins = (cH || 0) * 60 + (cM || 0);

  if (openMins <= closeMins) {
    return nowMins >= openMins && nowMins < closeMins ? "open" : "closed";
  } else {
    // Overnight operating window (e.g. 18:00 to 02:00)
    return nowMins >= openMins || nowMins < closeMins ? "open" : "closed";
  }
}

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
  const [uploadingRestaurantPic, setUploadingRestaurantPic] = useState(false);
  const [newFood, setNewFood] = useState({
    name: "",
    category: "",
    subcategory: "",
    price: "",
    discount: "0",
    description: "",
  });

  // Facebook-style Crop & Scale Modal State
  const [cropModal, setCropModal] = useState<{
    open: boolean;
    imageSrc: string | null;
    aspectRatio: CropAspectRatio;
    title: string;
    targetType: "restaurant" | "food";
    targetFoodId?: string;
  }>({
    open: false,
    imageSrc: null,
    aspectRatio: "cover",
    title: "Scale & Position Photo",
    targetType: "restaurant",
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
      const computed =
        data.restaurant.status === "shutdown"
          ? "shutdown"
          : computeStatusFromSystemTime(
              data.restaurant.open_time,
              data.restaurant.close_time,
              data.restaurant.status === "open" ? "open" : "closed"
            );
      setStatus(computed);
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

  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editingFoodDraft, setEditingFoodDraft] = useState<{
    name: string;
    price: string;
    discount: string;
    description: string;
    subcategory: string;
  }>({
    name: "",
    price: "",
    discount: "0",
    description: "",
    subcategory: "",
  });
  const [savingFoodId, setSavingFoodId] = useState<string | null>(null);
  const [savingRestaurantHours, setSavingRestaurantHours] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function handleStatusChange(nextStatus: "open" | "closed" | "shutdown") {
    if (!restaurant || restaurant.status === "banned" || nextStatus === status) return;
    setUpdatingStatus(true);
    try {
      await apiUpdateOwnerRestaurant(params.id, {
        open_time: restaurant.open_time,
        close_time: restaurant.close_time,
        status: nextStatus,
      });
      setStatus(nextStatus);
      toast(`Restaurant status changed to ${nextStatus.toUpperCase()}`, "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to change status", "danger");
    } finally {
      setUpdatingStatus(false);
    }
  }

  function handleOpenTimeChange(newVal: string) {
    if (!restaurant) return;
    const newOpen = `${newVal}:00`;
    const nextStatus = computeStatusFromSystemTime(newOpen, restaurant.close_time, status);
    setRestaurant({ ...restaurant, open_time: newOpen });
    if (status !== "shutdown") {
      setStatus(nextStatus);
    }
  }

  function handleCloseTimeChange(newVal: string) {
    if (!restaurant) return;
    const newClose = `${newVal}:00`;
    const nextStatus = computeStatusFromSystemTime(restaurant.open_time, newClose, status);
    setRestaurant({ ...restaurant, close_time: newClose });
    if (status !== "shutdown") {
      setStatus(nextStatus);
    }
  }

  async function handleSaveHours() {
    if (!restaurant) return;
    setSavingRestaurantHours(true);
    const newStatus = computeStatusFromSystemTime(
      restaurant.open_time,
      restaurant.close_time,
      status
    );
    try {
      await apiUpdateOwnerRestaurant(params.id, {
        open_time: restaurant.open_time,
        close_time: restaurant.close_time,
        status: newStatus,
      });
      setStatus(newStatus);
      toast(
        `Operating schedule saved. Restaurant is currently ${newStatus.toUpperCase()} based on system time`,
        "success"
      );
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to update operating hours", "danger");
    } finally {
      setSavingRestaurantHours(false);
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

  function startEditingFood(food: OwnerFood) {
    setEditingFoodId(food.food_id);
    setEditingFoodDraft({
      name: food.name,
      price: String(food.price),
      discount: String(food.discount),
      description: food.description || "",
      subcategory: food.subcategory || "",
    });
  }

  function cancelEditingFood() {
    setEditingFoodId(null);
  }

  async function handleSaveFood(foodId: string) {
    if (!editingFoodDraft.name.trim()) {
      toast("Food name cannot be empty", "warning");
      return;
    }
    const priceNum = Number(editingFoodDraft.price);
    if (isNaN(priceNum) || priceNum < 0) {
      toast("Please enter a valid price", "warning");
      return;
    }
    const discountNum = Number(editingFoodDraft.discount);
    if (isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
      toast("Discount must be between 0% and 100%", "warning");
      return;
    }

    setSavingFoodId(foodId);
    try {
      await apiUpdateOwnerFood(params.id, foodId, {
        name: editingFoodDraft.name.trim(),
        price: priceNum,
        discount: discountNum,
        description: editingFoodDraft.description.trim(),
        subcategory: editingFoodDraft.subcategory.trim(),
      });
      toast("Food item updated successfully", "success");
      setEditingFoodId(null);
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to update food", "danger");
    } finally {
      setSavingFoodId(null);
    }
  }

  function handleFoodFileSelect(foodId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast("Picture exceeds 10 MB limit. Please select an image under 10 MB.", "danger");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropModal({
        open: true,
        imageSrc: reader.result as string,
        aspectRatio: "food",
        title: "Scale & Position Dish Photo",
        targetType: "food",
        targetFoodId: foodId,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleRestaurantFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast("Picture exceeds 10 MB limit. Please select an image under 10 MB.", "danger");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropModal({
        open: true,
        imageSrc: reader.result as string,
        aspectRatio: "cover",
        title: "Scale & Position Restaurant Cover",
        targetType: "restaurant",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleCropComplete(croppedFile: File) {
    if (cropModal.targetType === "restaurant") {
      setUploadingRestaurantPic(true);
      try {
        const res = await apiUploadRestaurantPicture(params.id, croppedFile);
        toast(res.message || "Restaurant picture updated!", "success");
        setRestaurant((prev) => (prev ? { ...prev, picture_url: res.picture_url } : prev));
      } catch (err: any) {
        toast(err.message || "Failed to upload restaurant picture", "danger");
      } finally {
        setUploadingRestaurantPic(false);
      }
    } else if (cropModal.targetType === "food" && cropModal.targetFoodId) {
      const foodId = cropModal.targetFoodId;
      setUploadingFoodId(foodId);
      try {
        const res = await apiUploadFoodPicture(params.id, foodId, croppedFile);
        toast(res.message || "Food picture uploaded!", "success");
        setFoods((prev) =>
          prev.map((f) => (f.food_id === foodId ? { ...f, picture_url: res.picture_url } : f))
        );
      } catch (err: any) {
        toast(err.message || "Failed to upload food picture", "danger");
      } finally {
        setUploadingFoodId(null);
      }
    }
  }

  async function handleRestaurantPictureDelete() {
    if (!window.confirm("Are you sure you want to remove the restaurant picture?")) return;
    setUploadingRestaurantPic(true);
    try {
      await apiDeleteRestaurantPicture(params.id);
      toast("Restaurant picture removed!", "success");
      setRestaurant((prev) => (prev ? { ...prev, picture_url: null } : prev));
    } catch (err: any) {
      toast(err.message || "Failed to remove restaurant picture", "danger");
    } finally {
      setUploadingRestaurantPic(false);
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

          {/* Restaurant Cover Image Section */}
          <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-slate-50">
            <div className="relative h-44 sm:h-56 w-full">
              {restaurant.picture_url ? (
                <Image
                  src={getImageUrl(restaurant.picture_url)}
                  alt={restaurant.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 text-slate-400">
                  <span className="text-4xl">🍽️</span>
                  <span className="text-sm font-medium text-slate-500">No restaurant image uploaded yet</span>
                </div>
              )}

              {/* Action Buttons Overlay */}
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-3.5 py-2 text-xs font-bold text-slate-800 shadow-sm border border-slate-200 backdrop-blur-sm hover:bg-white hover:border-amber-300 transition">
                  {uploadingRestaurantPic ? "Uploading..." : restaurant.picture_url ? "📷 Change Picture" : "📷 Upload Picture"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={uploadingRestaurantPic}
                    onChange={handleRestaurantFileSelect}
                  />
                </label>

                {restaurant.picture_url && (
                  <button
                    type="button"
                    onClick={handleRestaurantPictureDelete}
                    disabled={uploadingRestaurantPic}
                    className="inline-flex items-center gap-1 rounded-xl bg-rose-600/90 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition"
                  >
                    🗑️ Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Modern Restaurant Status & Operating Hours Controls */}
          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            {/* Live Operational Status Switcher */}
            <div className="rounded-2xl border border-black/10 bg-slate-50/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                    Operating Status
                  </span>
                  <p className="text-[11px] text-slate-500">Live ordering state for customers</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    status === "open"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : status === "shutdown"
                      ? "bg-amber-50 text-amber-800 border-amber-300"
                      : "bg-slate-100 text-slate-700 border-slate-300"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      status === "open"
                        ? "bg-emerald-500 animate-pulse"
                        : status === "shutdown"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                    }`}
                  />
                  <span className="capitalize">{status}</span>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  disabled={restaurant.status === "banned" || updatingStatus}
                  onClick={() => handleStatusChange("open")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2.5 text-xs font-bold transition border cursor-pointer ${
                    status === "open"
                      ? "border-emerald-500 bg-emerald-500 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60"
                  } disabled:opacity-50`}
                >
                  <span>🟢</span> Open
                </button>

                <button
                  type="button"
                  disabled={restaurant.status === "banned" || updatingStatus}
                  onClick={() => handleStatusChange("closed")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2.5 text-xs font-bold transition border cursor-pointer ${
                    status === "closed"
                      ? "border-slate-700 bg-slate-800 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100"
                  } disabled:opacity-50`}
                >
                  <span>🔴</span> Closed
                </button>

                <button
                  type="button"
                  disabled={restaurant.status === "banned" || updatingStatus}
                  onClick={() => handleStatusChange("shutdown")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2.5 text-xs font-bold transition border cursor-pointer ${
                    status === "shutdown"
                      ? "border-amber-500 bg-amber-500 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/60"
                  } disabled:opacity-50`}
                >
                  <span>⏸️</span> Shutdown
                </button>
              </div>
            </div>

            {/* Operating Hours Card */}
            <div className="rounded-2xl border border-black/10 bg-slate-50/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                    Operating Schedule
                  </span>
                  <p className="text-[11px] text-slate-500">Opening & closing timings</p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveHours}
                  disabled={restaurant.status === "banned" || savingRestaurantHours}
                  className="rounded-full bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1 text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {savingRestaurantHours ? "Saving..." : "Save Hours"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <label className="text-[11px] font-semibold text-slate-600 block">
                  Opening Time
                  <input
                    type="time"
                    value={restaurant.open_time.slice(0, 5)}
                    onChange={(event) => handleOpenTimeChange(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-mono font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    disabled={restaurant.status === "banned"}
                  />
                </label>
                <label className="text-[11px] font-semibold text-slate-700 block">
                  Closing Time
                  <input
                    type="time"
                    value={restaurant.close_time.slice(0, 5)}
                    onChange={(event) => handleCloseTimeChange(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-mono font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    disabled={restaurant.status === "banned"}
                  />
                </label>
              </div>
            </div>
          </div>
        </Panel>

        {/* Menu & Food Items Panel with Picture Uploads */}
        <Panel className="space-y-6 p-6">
          <SectionHeading
            eyebrow="Menu management"
            title="Food Items & Pictures"
            description="Manage your catalogue, edit dishes in place, and upload high-resolution images."
          />

          {Object.keys(grouped).length === 0 ? (
            <p className="text-sm text-slate-500">No food items added yet.</p>
          ) : (
            Object.entries(grouped).map(([subcategory, items]) => (
              <section key={subcategory} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-black/5 pb-1.5">
                  <h3 className="font-bold text-slate-900 text-sm">{subcategory}</h3>
                  <span className="text-[11px] text-slate-600 bg-slate-100 font-medium px-2 py-0.5 rounded-full">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((food) => {
                    const isEditing = editingFoodId === food.food_id;
                    const hasDiscount = Number(food.discount) > 0;
                    const originalPrice = Number(food.price);
                    const discountedPrice = hasDiscount
                      ? Math.round(originalPrice * (1 - Number(food.discount) / 100))
                      : originalPrice;

                    return (
                      <div
                        key={food.food_id}
                        className={`rounded-2xl border transition ${
                          isEditing
                            ? "border-amber-400 bg-amber-50/30 ring-2 ring-amber-400/20 shadow-md p-4 space-y-3"
                            : "border-black/10 bg-slate-50/70 p-3.5 flex flex-col justify-between space-y-3 hover:shadow-xs"
                        }`}
                      >
                        {isEditing ? (
                          /* IN-PLACE FOOD EDIT FORM */
                          <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                <span>✏️</span> Edit Dish In Place
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">ID: {food.food_id}</span>
                            </div>

                            <div className="space-y-2.5">
                              <div>
                                <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                                  Food Name *
                                </label>
                                <input
                                  type="text"
                                  value={editingFoodDraft.name}
                                  onChange={(e) =>
                                    setEditingFoodDraft({ ...editingFoodDraft, name: e.target.value })
                                  }
                                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                                  placeholder="e.g. Classic Beef Burger"
                                />
                              </div>

                              <div>
                                <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                                  Subcategory
                                </label>
                                <input
                                  type="text"
                                  value={editingFoodDraft.subcategory}
                                  onChange={(e) =>
                                    setEditingFoodDraft({ ...editingFoodDraft, subcategory: e.target.value })
                                  }
                                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                                  placeholder="e.g. Burgers, Drinks, Platters"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                                    Price (৳) *
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editingFoodDraft.price}
                                    onChange={(e) =>
                                      setEditingFoodDraft({ ...editingFoodDraft, price: e.target.value })
                                    }
                                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                                    placeholder="0.00"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                                    Discount (%)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={editingFoodDraft.discount}
                                    onChange={(e) =>
                                      setEditingFoodDraft({ ...editingFoodDraft, discount: e.target.value })
                                    }
                                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                                    placeholder="0"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                                  Description
                                </label>
                                <textarea
                                  rows={2}
                                  value={editingFoodDraft.description}
                                  onChange={(e) =>
                                    setEditingFoodDraft({ ...editingFoodDraft, description: e.target.value })
                                  }
                                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 resize-none"
                                  placeholder="Item ingredients, flavors, and serving details..."
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/60">
                              <button
                                type="button"
                                onClick={cancelEditingFood}
                                disabled={savingFoodId === food.food_id}
                                className="rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveFood(food.food_id)}
                                disabled={savingFoodId === food.food_id}
                                className="rounded-full bg-amber-500 hover:bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
                              >
                                {savingFoodId === food.food_id ? "Saving..." : "Save Changes"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* STANDARD FOOD CARD VIEW */
                          <>
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
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
                                    onChange={(e) => handleFoodFileSelect(food.food_id, e)}
                                    disabled={uploadingFoodId === food.food_id}
                                    className="hidden"
                                  />
                                </label>
                              </div>

                              <div>
                                <div className="flex items-start justify-between gap-1.5">
                                  <h4 className="font-bold text-slate-900 text-sm leading-snug">{food.name}</h4>
                                  <div className="text-right shrink-0">
                                    {hasDiscount ? (
                                      <div className="flex flex-col items-end">
                                        <span className="text-xs font-bold text-amber-700">৳{discountedPrice}</span>
                                        <span className="text-[10px] text-slate-400 line-through">৳{originalPrice}</span>
                                      </div>
                                    ) : (
                                      <span className="text-xs font-bold text-amber-700">৳{originalPrice}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  <span className="text-[10px] text-slate-600 bg-white border border-black/5 font-semibold px-2 py-0.5 rounded-full">
                                    {food.category}
                                  </span>
                                  {hasDiscount && (
                                    <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 font-bold px-1.5 py-0.5 rounded-full">
                                      {food.discount}% OFF
                                    </span>
                                  )}
                                </div>
                                {food.description && (
                                  <p className="text-xs text-slate-600 line-clamp-2 mt-1.5 leading-relaxed">
                                    {food.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-black/5">
                              <button
                                type="button"
                                onClick={() => startEditingFood(food)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 transition cursor-pointer"
                              >
                                <span>✏️</span> Edit in place
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFood(food.food_id)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline transition cursor-pointer"
                              >
                                <span>🗑️</span> Remove
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
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

      <ImageCropModal
        open={cropModal.open}
        imageSrc={cropModal.imageSrc}
        aspectRatio={cropModal.aspectRatio}
        title={cropModal.title}
        onClose={() => setCropModal((prev) => ({ ...prev, open: false }))}
        onCropComplete={handleCropComplete}
      />
    </AppShell>
  );
}
