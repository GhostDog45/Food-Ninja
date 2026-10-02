"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading, cn } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { customerNav, ownerNav, riderNav, adminNav } from "@/lib/platform";
import {
  getAuthUser,
  clearAuthSession,
  apiChangePassword,
  apiUpdateEmail,
  apiUpdatePhone,
  apiUpdateLocation,
  setOnboarded,
  getOnboardingDetails,
  apiGetUserProfile,
  apiUploadUserPfp,
  getImageUrl,
  type UserProfile,
} from "@/lib/backend";
import { OSMLocationPicker } from "@/components/osm-location-picker";
import { ImageCropModal } from "@/components/image-crop-modal";

export default function CustomerProfilePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [user, setUser] = useState<{ username: string; user_type: string; email?: string } | null>(null);
  const [liveProfile, setLiveProfile] = useState<UserProfile | null>(null);
  const [uploadingPfp, setUploadingPfp] = useState(false);
  const [cropModal, setCropModal] = useState<{
    open: boolean;
    imageSrc: string;
    originalFile?: File | null;
  }>({
    open: false,
    imageSrc: "",
    originalFile: null,
  });
  const [profileDetails, setProfileDetails] = useState<Record<string, any> | null>(null);

  // Location state
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [tempLat, setTempLat] = useState(23.7925);
  const [tempLng, setTempLng] = useState(90.4078);
  const [tempArea, setTempArea] = useState("Gulshan 2, Dhaka");

  // Settings active tab
  const [activeTab, setActiveTab] = useState<"security" | "email" | "phone">("security");

  // Change Password State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Update Email State
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Update Phone State
  const [newPhone, setNewPhone] = useState("");
  const [phonePassword, setPhonePassword] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);

  // Clear credentials form inputs when switching tabs
  useEffect(() => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNewEmail("");
    setEmailPassword("");
    setNewPhone("");
    setPhonePassword("");
  }, [activeTab]);

  useEffect(() => {
    const authUser = getAuthUser();
    if (authUser) {
      setUser(authUser);
      apiGetUserProfile()
        .then((p) => {
          setLiveProfile(p);
          if (p.latitude && p.longitude) {
            setTempLat(Number(p.latitude));
            setTempLng(Number(p.longitude));
          }
        })
        .catch(() => {});

      const details = getOnboardingDetails(authUser.username);
      if (details) {
        setProfileDetails(details);
        if (details.latitude) setTempLat(Number(details.latitude));
        if (details.longitude) setTempLng(Number(details.longitude));
        if (details.area) setTempArea(String(details.area));
      }
    }
  }, []);

  function handlePfpFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast("Picture exceeds 25 MB limit. Please select an image under 25 MB.", "danger");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropModal({
        open: true,
        imageSrc: reader.result as string,
        originalFile: file,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleCropComplete(croppedFile: File) {
    setUploadingPfp(true);
    try {
      const res = await apiUploadUserPfp(croppedFile);
      toast(res.message || "Profile picture updated successfully!", "success");
      setLiveProfile((prev) => (prev ? { ...prev, pfp_url: res.pfp_url } : null));
    } catch (err: any) {
      toast(err.message || "Failed to upload profile picture", "danger");
    } finally {
      setUploadingPfp(false);
    }
  }

  function handleLogout() {
    clearAuthSession();
    toast("Logged out successfully", "default");
    router.push("/login");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (!oldPassword || !newPassword) {
      toast("Please enter both current and new passwords", "warning");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast("New passwords do not match", "danger");
      return;
    }

    if (newPassword === oldPassword) {
      toast("New password must be different from current password", "warning");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await apiChangePassword(oldPassword, newPassword);
      toast(res.message || "Password changed successfully!", "success");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to change password", "danger");
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault();

    if (!newEmail.trim() || !emailPassword) {
      toast("Please enter new email and verify with current password", "warning");
      return;
    }

    setEmailLoading(true);
    try {
      const res = await apiUpdateEmail(newEmail.trim(), emailPassword);
      toast(res.message || "Email updated successfully!", "success");
      setNewEmail("");
      setEmailPassword("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update email", "danger");
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleUpdatePhone(e: React.FormEvent) {
    e.preventDefault();

    if (!newPhone.trim() || !phonePassword) {
      toast("Please enter new phone number and verify with current password", "warning");
      return;
    }

    setPhoneLoading(true);
    try {
      const res = await apiUpdatePhone(newPhone.trim(), phonePassword);
      toast(res.message || "Phone number updated successfully!", "success");
      setNewPhone("");
      setPhonePassword("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update phone number", "danger");
    } finally {
      setPhoneLoading(false);
    }
  }


  async function handleSaveLocation() {
    if (!user) return;
    setIsSavingLocation(true);
    try {
      // 1. Update PostgreSQL PostGIS geography in backend
      await apiUpdateLocation({ latitude: tempLat, longitude: tempLng });

      // 2. Persist updated location details in profile storage
      const updated = {
        ...(profileDetails || {}),
        latitude: tempLat,
        longitude: tempLng,
        area: tempArea,
        updatedAt: new Date().toISOString(),
      };

      setOnboarded(user.username, updated);
      setProfileDetails(updated);
      setIsEditingLocation(false);
      toast("Delivery location updated successfully!", "success");
    } catch {
      // Offline fallback
      const updated = {
        ...(profileDetails || {}),
        latitude: tempLat,
        longitude: tempLng,
        area: tempArea,
        offlineFallback: true,
      };
      setOnboarded(user.username, updated);
      setProfileDetails(updated);
      setIsEditingLocation(false);
      toast("Location updated locally!", "success");
    } finally {
      setIsSavingLocation(false);
    }
  }

  const hasCustomLocation = Boolean(profileDetails?.area || profileDetails?.latitude);
  const currentArea = profileDetails?.area || (hasCustomLocation ? tempArea : "Delivery location not calibrated");
  const currentLat = profileDetails?.latitude ? Number(profileDetails.latitude).toFixed(4) : (hasCustomLocation ? tempLat.toFixed(4) : "23.8103");
  const currentLng = profileDetails?.longitude ? Number(profileDetails.longitude).toFixed(4) : (hasCustomLocation ? tempLng.toFixed(4) : "90.4125");

  return (
    <AppShell
      role="Account portal"
      title="Profile & Settings"
      subtitle="Manage your profile credentials, change password, and view order history."
      nav={user?.user_type === "owner" ? ownerNav : user?.user_type === "rider" ? riderNav : user?.user_type === "admin" ? adminNav : customerNav}
      actions={
        <div className="flex items-center gap-2">
          <Badge tone="primary">
            {user ? `${user.username} (${user.user_type})` : "Guest"}
          </Badge>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        {/* Left column: Active & Recent orders */}
        {/* Left column: Account & Location */}
        <div className="space-y-6">
          {/* Quick link banner to Order History */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🥡</span>
              <div>
                <h4 className="text-xs font-bold text-amber-950">Looking for your orders & receipts?</h4>
                <p className="text-[11px] text-amber-800">
                  Track live deliveries and leave restaurant & courier reviews in Order History.
                </p>
              </div>
            </div>
            <Link
              href="/orders"
              className="shrink-0 rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-600 transition"
            >
              Order History →
            </Link>
          </div>

          {/* Delivery Location & Map Editor */}
          <Panel className="space-y-5 p-6">
            <SectionHeading eyebrow="Account summary" title="Account Details" />

            {/* Profile Avatar & Upload Section */}
            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-gradient-to-r from-amber-50/80 to-orange-50/50 border border-amber-200/60 shadow-2xs">
              <div className="relative group shrink-0">
                <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-amber-500 shadow-md bg-slate-100 flex items-center justify-center relative">
                  {liveProfile?.pfp_url ? (
                    <>
                      <img
                        src={getImageUrl(liveProfile.pfp_url)}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 h-full w-full object-cover blur-sm opacity-40 scale-110"
                      />
                      <img
                        src={getImageUrl(liveProfile.pfp_url)}
                        alt={liveProfile.name || user?.username || "Avatar"}
                        className="relative z-1 h-full w-full object-contain"
                      />
                    </>
                  ) : (
                    <span className="text-3xl">👤</span>
                  )}
                  {uploadingPfp && (
                    <div className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center text-white text-[11px] font-semibold">
                      <span className="animate-spin text-base">⏳</span>
                      <span>Uploading...</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 text-center sm:text-left space-y-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{liveProfile?.name || user?.username}</h3>
                  <p className="text-xs text-slate-500 font-mono">@{user?.username} · {liveProfile?.email || user?.email || "No email"}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition">
                    <span>📷</span> {uploadingPfp ? "Uploading..." : "Upload Profile Picture"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handlePfpFileSelect}
                      disabled={uploadingPfp}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-slate-500">Max 5 MB (JPG, PNG, WebP)</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="text-xs text-slate-500 block">Username:</span>
                <span className="text-sm font-semibold text-slate-900 font-mono">
                  @{user?.username || "Not logged in"}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Account Role:</span>
                <span className="text-sm font-semibold capitalize text-amber-600">{user?.user_type || "User"}</span>
              </div>
            </div>

            {/* Current Active Location Card */}
            <div className="rounded-2xl border border-black/10 bg-slate-50/80 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${hasCustomLocation ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">{currentArea}</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {hasCustomLocation ? `${currentLat}° N, ${currentLng}° E` : "Location not calibrated — click Edit Location"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingLocation((prev) => !prev)}
                  className="rounded-full border border-black/10 bg-white px-3.5 py-1 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-100 hover:text-amber-700 transition shrink-0"
                >
                  {isEditingLocation ? "Hide Map" : "Edit Location"}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Couriers use your delivery location to compute distance, delivery time, and optimal routing.
              </p>
            </div>

            {/* Expandable OpenStreetMap Editor */}
            {isEditingLocation && (
              <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/30 p-4 animate-fadeIn">
                <div>
                  <p className="text-xs font-bold text-slate-900">Pin New Delivery Location on OpenStreetMap</p>
                  <p className="text-[11px] text-slate-500">
                    Click anywhere on the map, drag the pin, or click &quot;My Live GPS&quot; to set your coordinates.
                  </p>
                </div>

                <OSMLocationPicker
                  initialLat={Number(profileDetails?.latitude || tempLat)}
                  initialLng={Number(profileDetails?.longitude || tempLng)}
                  onLocationChange={(lat: number, lng: number, address?: string) => {
                    setTempLat(lat);
                    setTempLng(lng);
                    if (address) setTempArea(address);
                  }}
                />

                <div className="flex items-center justify-end gap-2 pt-2">
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
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition disabled:opacity-50"
                  >
                    <span>{isSavingLocation ? "Saving..." : "Save Location"}</span>
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* Right column: Security & Credentials update */}
        <div className="space-y-6">
          <Panel className="space-y-5 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeading eyebrow="Security settings" title="Manage credentials" />
              {/* Tab Selector */}
              <div className="flex gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("security")}
                  className={cn(
                    "rounded-xl px-3 py-1 text-xs font-medium transition",
                    activeTab === "security"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-slate-300 hover:text-white"
                  )}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("email")}
                  className={cn(
                    "rounded-xl px-3 py-1 text-xs font-medium transition",
                    activeTab === "email"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-slate-300 hover:text-white"
                  )}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("phone")}
                  className={cn(
                    "rounded-xl px-3 py-1 text-xs font-medium transition",
                    activeTab === "phone"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-slate-300 hover:text-white"
                  )}
                >
                  Phone
                </button>
              </div>
            </div>

            {/* TAB 1: Change Password */}
            {activeTab === "security" && (
              <form onSubmit={handleChangePassword} autoComplete="off" className="space-y-4">
                {/* Off-screen trap elements to absorb browser password manager autofill */}
                <div style={{ opacity: 0, position: "absolute", top: 0, left: 0, height: 0, width: 0, zIndex: -1, overflow: "hidden" }} aria-hidden="true">
                  <input type="text" name="chrome_pwd_trap_u" tabIndex={-1} defaultValue="" />
                  <input type="password" name="chrome_pwd_trap_p" tabIndex={-1} defaultValue="" />
                </div>

                <p className="text-xs text-slate-400">
                  Verify with your current password to set a new password for your account.
                </p>

                <label className="space-y-1.5 text-sm text-slate-300 block">
                  <span>Current Password *</span>
                  <input
                    type="password"
                    name="fn_chg_pwd_old"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none placeholder:text-slate-500"
                    placeholder="••••••••"
                    required
                  />
                </label>

                <label className="space-y-1.5 text-sm text-slate-300 block">
                  <span>New Password *</span>
                  <input
                    type="password"
                    name="fn_chg_pwd_new"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none placeholder:text-slate-500"
                    placeholder="New password"
                    required
                  />
                </label>

                <label className="space-y-1.5 text-sm text-slate-300 block">
                  <span>Confirm New Password *</span>
                  <input
                    type="password"
                    name="fn_chg_pwd_repeat"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none placeholder:text-slate-500"
                    placeholder="Confirm new password"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-amber-600 disabled:cursor-wait disabled:opacity-70"
                >
                  {passwordLoading ? "Updating..." : "Change Password"}
                </button>
              </form>
            )}

            {/* TAB 2: Update Email */}
            {activeTab === "email" && (
              <form onSubmit={handleUpdateEmail} autoComplete="off" className="space-y-4">
                {/* Off-screen trap elements to absorb browser password manager autofill */}
                <div style={{ opacity: 0, position: "absolute", top: 0, left: 0, height: 0, width: 0, zIndex: -1, overflow: "hidden" }} aria-hidden="true">
                  <input type="text" name="chrome_email_trap_u" tabIndex={-1} defaultValue="" />
                  <input type="password" name="chrome_email_trap_p" tabIndex={-1} defaultValue="" />
                </div>

                <p className="text-xs text-slate-400">
                  Enter your new email address and verify with your current password.
                </p>

                <label className="space-y-1.5 text-sm text-slate-300 block">
                  <span>New Email Address *</span>
                  <input
                    type="email"
                    name="fn_upd_email_target"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none placeholder:text-slate-500"
                    placeholder="newemail@example.com"
                    required
                  />
                </label>

                <label className="space-y-1.5 text-sm text-slate-300 block">
                  <span>Current Password for Verification *</span>
                  <input
                    type="password"
                    name="fn_upd_email_auth_pwd"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none placeholder:text-slate-500"
                    placeholder="••••••••"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={emailLoading}
                  className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-amber-600 disabled:cursor-wait disabled:opacity-70"
                >
                  {emailLoading ? "Updating..." : "Update Email Address"}
                </button>
              </form>
            )}

            {/* TAB 3: Update Phone */}
            {activeTab === "phone" && (
              <form onSubmit={handleUpdatePhone} autoComplete="off" className="space-y-4">
                {/* Off-screen trap elements to absorb browser password manager autofill */}
                <div style={{ opacity: 0, position: "absolute", top: 0, left: 0, height: 0, width: 0, zIndex: -1, overflow: "hidden" }} aria-hidden="true">
                  <input type="text" name="chrome_phone_trap_u" tabIndex={-1} defaultValue="" />
                  <input type="password" name="chrome_phone_trap_p" tabIndex={-1} defaultValue="" />
                </div>

                <p className="text-xs text-slate-400">
                  Enter your new Bangladeshi phone number (e.g. 01700000000) and verify with your current password.
                </p>

                <label className="space-y-1.5 text-sm text-slate-300 block">
                  <span>New Phone Number *</span>
                  <input
                    type="text"
                    name="fn_upd_phone_target"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none placeholder:text-slate-500"
                    placeholder="01700000000"
                    required
                  />
                </label>

                <label className="space-y-1.5 text-sm text-slate-300 block">
                  <span>Current Password for Verification *</span>
                  <input
                    type="password"
                    name="fn_upd_phone_auth_pwd"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={phonePassword}
                    onChange={(e) => setPhonePassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none placeholder:text-slate-500"
                    placeholder="••••••••"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={phoneLoading}
                  className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-amber-600 disabled:cursor-wait disabled:opacity-70"
                >
                  {phoneLoading ? "Updating..." : "Update Phone Number"}
                </button>
              </form>
            )}
          </Panel>
        </div>
      </div>

      <ImageCropModal
        open={cropModal.open}
        imageSrc={cropModal.imageSrc}
        originalFile={cropModal.originalFile}
        aspectRatio="square"
        title="Profile Picture Preview & Options"
        onClose={() => setCropModal((prev) => ({ ...prev, open: false }))}
        onCropComplete={handleCropComplete}
      />
    </AppShell>
  );
}
