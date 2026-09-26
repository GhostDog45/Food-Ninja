"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { riderNav } from "@/lib/platform";
import {
  apiGetRiderProfile,
  apiUploadRiderPfp,
  apiUpdateLocation,
  apiUpdateRiderVehicle,
  getImageUrl,
  type RiderProfile,
} from "@/lib/backend";
import { OSMLocationPicker } from "@/components/osm-location-picker";

export default function RiderProfilePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPfp, setUploadingPfp] = useState(false);

  // Static base location state
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [tempLat, setTempLat] = useState(23.7925);
  const [tempLng, setTempLng] = useState(90.4078);
  const [tempAddress, setTempAddress] = useState("Gulshan 2, Dhaka");

  // Vehicle state
  const [isUpdatingVehicle, setIsUpdatingVehicle] = useState(false);

  async function loadProfile() {
    try {
      setLoading(true);
      const data = await apiGetRiderProfile();
      setProfile(data);
      if (data.latitude && data.longitude) {
        setTempLat(Number(data.latitude));
        setTempLng(Number(data.longitude));
      }
    } catch (err: any) {
      toast(err.message || "Failed to load rider profile", "danger");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateVehicle(newVehicle: "bike" | "bicycle") {
    setIsUpdatingVehicle(true);
    try {
      const res = await apiUpdateRiderVehicle(newVehicle);
      setProfile((prev) => (prev ? { ...prev, vehicle: res.vehicle } : null));
      toast(res.message || "Vehicle updated successfully!", "success");
    } catch (err: any) {
      toast(err.message || "Failed to update vehicle", "danger");
    } finally {
      setIsUpdatingVehicle(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function handlePfpUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast(
        `Picture exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select a file smaller than 5 MB.`,
        "danger"
      );
      e.target.value = "";
      return;
    }

    setUploadingPfp(true);
    try {
      const res = await apiUploadRiderPfp(file);
      toast(res.message || "Rider profile picture updated successfully!", "success");
      setProfile((prev) => (prev ? { ...prev, pfp_url: res.pfp_url } : null));
    } catch (err: any) {
      toast(err.message || "Failed to upload rider profile picture", "danger");
    } finally {
      setUploadingPfp(false);
      e.target.value = "";
    }
  }

  async function handleSaveLocation() {
    setIsSavingLocation(true);
    try {
      await apiUpdateLocation({ latitude: tempLat, longitude: tempLng });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              latitude: tempLat,
              longitude: tempLng,
            }
          : null
      );
      setIsEditingLocation(false);
      toast("Static base location updated successfully!", "success");
    } catch (err: any) {
      toast(err.message || "Failed to update base location", "danger");
    } finally {
      setIsSavingLocation(false);
    }
  }

  const hasBaseLocation = Boolean(profile?.latitude && profile?.longitude);
  const currentLat = profile?.latitude ? Number(profile.latitude).toFixed(4) : tempLat.toFixed(4);
  const currentLng = profile?.longitude ? Number(profile.longitude).toFixed(4) : tempLng.toFixed(4);

  return (
    <AppShell
      role="Rider app"
      title="Rider Profile"
      subtitle="Manage your identity, static base location, vehicle credentials, and earnings."
      nav={riderNav}
      actions={
        <Badge tone={profile?.status === "online" ? "success" : profile?.status === "delivering" ? "warning" : "neutral"}>
          {profile?.status ? `Status: ${profile.status.toUpperCase()}` : "RIDER"}
        </Badge>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-6">
          {/* Financial Overview (Balance and Due Amount) */}
          <Panel className="space-y-4 p-6 sm:p-8">
            <SectionHeading
              eyebrow="Financial Overview"
              title="Wallet & Cash Settlement"
              description="Track your earnings and cash collected on deliveries."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                    Earnings Balance
                  </span>
                  <span className="text-lg">💰</span>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-emerald-700">
                  ৳{Number(profile?.balance || 0).toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-emerald-800">
                  Payable to you. Credited with delivery fees upon successful dropoff.
                </p>
              </div>

              <div className="rounded-2xl border border-rose-500/20 bg-rose-50/50 p-5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-rose-800">
                    Due Amount
                  </span>
                  <span className="text-lg">💵</span>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-rose-700">
                  ৳{Number(profile?.due_amount || 0).toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-rose-800">
                  Owed to restaurant owners/platform after collecting cash from customers on COD orders.
                </p>
              </div>
            </div>
          </Panel>

          {/* Static Base Location & Map Picker */}
          <Panel className="space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SectionHeading
                  eyebrow="Service Area Calibration"
                  title="Static Base Location"
                  description="Your static base determines the service perimeter for available delivery offers."
                />
              </div>
              <button
                type="button"
                onClick={() => setIsEditingLocation((prev) => !prev)}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-xs hover:bg-amber-50 hover:border-amber-200 transition"
              >
                {isEditingLocation ? "Hide Map" : hasBaseLocation ? "Update Base Location" : "Set Base Location"}
              </button>
            </div>

            {/* Current Base Location Card */}
            <div className="rounded-2xl border border-black/5 bg-slate-50/80 p-4 space-y-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`h-3 w-3 rounded-full shrink-0 ${
                    hasBaseLocation ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                  }`}
                />
                <div>
                  <span className="text-sm font-bold text-slate-900 block">
                    {hasBaseLocation ? "Base Location Configured" : "Base Location Not Set"}
                  </span>
                  <span className="font-mono text-xs text-slate-600">
                    {hasBaseLocation
                      ? `${currentLat}° N, ${currentLng}° E`
                      : "Please set your base location coordinates below to receive order offers"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Offers appear when restaurants are within 8 km and customers are within 10 km of this static base point.
              </p>
            </div>

            {/* Expandable Location Picker */}
            {isEditingLocation && (
              <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/30 p-4 sm:p-5 animate-fadeIn">
                <div>
                  <p className="text-xs font-bold text-slate-900">Pin Your Static Base Location</p>
                  <p className="text-[11px] text-slate-500">
                    Click anywhere on the map, drag the pin, or click &quot;My Live GPS&quot; to calibrate your base coordinates.
                  </p>
                </div>

                <OSMLocationPicker
                  initialLat={Number(profile?.latitude || tempLat)}
                  initialLng={Number(profile?.longitude || tempLng)}
                  onLocationChange={(lat: number, lng: number, address?: string) => {
                    setTempLat(lat);
                    setTempLng(lng);
                    if (address) setTempAddress(address);
                  }}
                />

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingLocation(false)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLocation}
                    disabled={isSavingLocation}
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-600 transition disabled:opacity-50"
                  >
                    <span>{isSavingLocation ? "Saving..." : "Save Base Location"}</span>
                  </button>
                </div>
              </div>
            )}
          </Panel>

          {/* Account Details & Vehicle */}
          <Panel className="space-y-6 p-6 sm:p-8">
            <SectionHeading eyebrow="Identity & Vehicle" title="Rider Account Details" />

            {/* Profile Picture Card */}
            <div className="flex flex-col sm:flex-row items-center gap-5 p-5 rounded-2xl bg-gradient-to-r from-amber-50/80 to-orange-50/50 border border-amber-200/60 shadow-2xs">
              <div className="relative group shrink-0">
                <div className="h-24 w-24 rounded-2xl overflow-hidden border-2 border-white ring-2 ring-amber-500/20 shadow-md bg-slate-100 flex items-center justify-center relative">
                  {profile?.pfp_url ? (
                    <Image
                      src={getImageUrl(profile.pfp_url)}
                      alt={profile.name || profile.username || "Rider Avatar"}
                      width={96}
                      height={96}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl">🚴</span>
                  )}
                  {uploadingPfp && (
                    <div className="absolute inset-0 bg-black/60 rounded-2xl flex flex-col items-center justify-center text-white text-[11px] font-semibold">
                      <span className="animate-spin text-base">⏳</span>
                      <span>Uploading...</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 text-center sm:text-left space-y-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {profile?.name || (loading ? "Loading..." : "Rider")}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    @{profile?.username || "username"} · {profile?.email || "No email"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 text-xs font-semibold shadow-xs transition">
                    <span>📷</span> {uploadingPfp ? "Uploading..." : "Upload Profile Picture"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handlePfpUpload}
                      disabled={uploadingPfp}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-slate-500">Max size 5 MB (JPG, PNG, WebP)</span>
                </div>
              </div>
            </div>

            {/* Profile Fields Grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-black/5 bg-slate-50/70 p-4 space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Full Name</span>
                <p className="text-sm font-semibold text-slate-900">{profile?.name || "—"}</p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-slate-50/70 p-4 space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Username</span>
                <p className="text-sm font-semibold text-slate-900 font-mono">@{profile?.username || "—"}</p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-slate-50/70 p-4 space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Contact Phone</span>
                <p className="text-sm font-semibold text-slate-900">{profile?.phone || "—"}</p>
              </div>

              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 space-y-2.5 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-900 block">
                      Assigned Vehicle
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Switching your vehicle updates your profile in the database and recalibrates transit speeds (Motorcycle: 30 km/h, Bicycle: 16 km/h).
                    </p>
                  </div>
                  <span className="text-xs font-bold text-amber-800 bg-amber-100/80 border border-amber-300/60 px-3 py-1 rounded-full">
                    Active: {profile?.vehicle === "bike" ? "🏍️ Motorcycle" : "🚴 Bicycle"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isUpdatingVehicle || profile?.vehicle === "bike"}
                    onClick={() => handleUpdateVehicle("bike")}
                    className={`flex items-center justify-center gap-2 rounded-xl p-3 text-xs font-bold transition border ${
                      profile?.vehicle === "bike"
                        ? "border-amber-500 bg-amber-500 text-white shadow-xs"
                        : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50"
                    } disabled:opacity-85`}
                  >
                    <span className="text-base">🏍️</span>
                    <span>Motorcycle (Bike)</span>
                    {profile?.vehicle === "bike" && <span>✓</span>}
                  </button>

                  <button
                    type="button"
                    disabled={isUpdatingVehicle || profile?.vehicle === "bicycle"}
                    onClick={() => handleUpdateVehicle("bicycle")}
                    className={`flex items-center justify-center gap-2 rounded-xl p-3 text-xs font-bold transition border ${
                      profile?.vehicle === "bicycle"
                        ? "border-amber-500 bg-amber-500 text-white shadow-xs"
                        : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50"
                    } disabled:opacity-85`}
                  >
                    <span className="text-base">🚴</span>
                    <span>Bicycle</span>
                    {profile?.vehicle === "bicycle" && <span>✓</span>}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-black/5 bg-slate-50/70 p-4 space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Registered Email</span>
                <p className="text-sm font-semibold text-slate-900 truncate">{profile?.email || "—"}</p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-slate-50/70 p-4 space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Registration Date</span>
                <p className="text-sm font-semibold text-slate-700">
                  {profile?.reg_date ? new Date(profile.reg_date).toLocaleDateString() : "Active Member"}
                </p>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right column: Guidelines & Policy */}
        <div className="space-y-6">
          <Panel className="space-y-5 p-6 sm:p-8">
            <SectionHeading eyebrow="Courier Policy" title="Operations & Guidelines" />
            <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed">
              <div className="rounded-2xl border border-black/5 bg-slate-50/70 p-4 space-y-1">
                <p className="font-bold text-slate-900">📍 Static Base vs Live Location</p>
                <p className="text-slate-600">
                  Your <strong>static base location</strong> defines your home territory for receiving orders within 8-10 km. While on shift, your <strong>live location</strong> via WebSocket confirms you are within 4 km of the restaurant for pickup.
                </p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-slate-50/70 p-4 space-y-1">
                <p className="font-bold text-slate-900">💵 Cash Collections & Due Amount</p>
                <p className="text-slate-600">
                  When you deliver a Cash on Delivery order, you collect the total bill from the customer. The delivery charge is credited to your balance, while the food amount is logged in your Due Amount to be remitted to the restaurant owner or platform.
                </p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-slate-50/70 p-4 space-y-1">
                <p className="font-bold text-slate-900">⚡ Vehicle Transit Speed</p>
                <p className="text-slate-600">
                  Motorcycle couriers are calibrated to 30 km/h in clear traffic; bicycle couriers average 16 km/h. Delivery estimates and customer notifications adjust automatically based on your vehicle.
                </p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-slate-50/70 p-4 space-y-1">
                <p className="font-bold text-slate-900">🛡️ Profile Picture Verification</p>
                <p className="text-slate-600">
                  Ensure your photo is clearly visible. Restaurant staff and customers view your profile picture during order handover to ensure security and trust.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
