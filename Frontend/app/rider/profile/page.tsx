"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { riderNav } from "@/lib/platform";
import {
  apiGetRiderProfile,
  apiUploadRiderPfp,
  getImageUrl,
  type RiderProfile,
} from "@/lib/backend";

export default function RiderProfilePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPfp, setUploadingPfp] = useState(false);

  async function loadProfile() {
    try {
      setLoading(true);
      const data = await apiGetRiderProfile();
      setProfile(data);
    } catch (err: any) {
      toast(err.message || "Failed to load rider profile", "danger");
    } finally {
      setLoading(false);
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

  return (
    <AppShell
      role="Rider app"
      title="Rider Profile"
      subtitle="Manage your identity, vehicle credentials, and profile picture."
      nav={riderNav}
      actions={
        <Badge tone={profile?.status === "active" ? "success" : "neutral"}>
          {profile?.status ? `Status: ${profile.status.toUpperCase()}` : "Active Rider"}
        </Badge>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-6">
          <Panel className="space-y-6 p-6">
            <SectionHeading eyebrow="Identity & Vehicle" title="Rider Account Details" />

            {/* Profile Picture Card */}
            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-amber-500/10 to-transparent border border-emerald-500/20 shadow-2xs">
              <div className="relative group shrink-0">
                <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-emerald-500 shadow-md bg-slate-800 flex items-center justify-center relative">
                  {profile?.pfp_url ? (
                    <img
                      src={getImageUrl(profile.pfp_url)}
                      alt={profile.name || profile.username || "Rider Avatar"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl">🚴</span>
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
                  <h3 className="text-base font-bold text-white">
                    {profile?.name || (loading ? "Loading..." : "Rider")}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    @{profile?.username || "username"} · {profile?.email || "No email"}
                  </p>
                  {profile?.balance !== undefined && (
                    <p className="text-xs font-semibold text-emerald-400 mt-0.5">
                      Earnings Balance: ৳{Number(profile.balance).toFixed(2)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition">
                    <span>📷</span> {uploadingPfp ? "Uploading..." : "Upload Profile Picture"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handlePfpUpload}
                      disabled={uploadingPfp}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-slate-400">Max size 5 MB (JPG, PNG, WebP)</span>
                </div>
              </div>
            </div>

            {/* Profile Fields Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <span className="text-xs text-slate-400 block">Full Name</span>
                <p className="text-sm font-semibold text-white">{profile?.name || "—"}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <span className="text-xs text-slate-400 block">Username</span>
                <p className="text-sm font-semibold text-white font-mono">@{profile?.username || "—"}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <span className="text-xs text-slate-400 block">Contact Phone</span>
                <p className="text-sm font-semibold text-white">{profile?.phone || "—"}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <span className="text-xs text-slate-400 block">Assigned Vehicle</span>
                <p className="text-sm font-semibold text-amber-400 capitalize">
                  {profile?.vehicle === "bike" ? "🏍️ Motorcycle" : "🚴 Bicycle"}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <span className="text-xs text-slate-400 block">Registered Email</span>
                <p className="text-sm font-semibold text-white truncate">{profile?.email || "—"}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <span className="text-xs text-slate-400 block">Registration Date</span>
                <p className="text-sm font-semibold text-slate-300">
                  {profile?.reg_date ? new Date(profile.reg_date).toLocaleDateString() : "Active Member"}
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel className="space-y-4 p-6">
            <SectionHeading eyebrow="Vehicle Policy" title="Courier Guidelines" />
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <p className="font-semibold text-emerald-400">🛡️ Keep Photo Up-to-Date</p>
                <p className="text-slate-400">
                  Customers and restaurants view your profile photo when coordinating pick up and delivery handoffs.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <p className="font-semibold text-amber-400">⚡ Speed & Vehicle Transit</p>
                <p className="text-slate-400">
                  Motorcycle couriers average 30 km/h in clear traffic, while bicycle couriers average 16 km/h. Delivery estimates are automatically calibrated to your registered vehicle.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <p className="font-semibold text-cyan-400">📍 Real-time Location</p>
                <p className="text-slate-400">
                  Keep your GPS tracking enabled while on active delivery shifts to ensure dispatch assignment works seamlessly.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
