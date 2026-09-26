"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { adminNav } from "@/lib/platform";
import { apiAdjustRiderAmounts, apiGetAdminProfile, getImageUrl, type AdminOrder } from "@/lib/backend";
import { useToast } from "@/components/toast-provider";

export default function AdminProfileDetailPage() {
  const params = useParams<{ resource: string; id: string }>();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [restaurants, setRestaurants] = useState<
    Array<{ restaurant_id: string; name: string; status: string; open_time: string; close_time: string }>
  >([]);
  const [duePaid, setDuePaid] = useState("");
  const [withdrawal, setWithdrawal] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    apiGetAdminProfile(params.resource, params.id)
      .then((data) => {
        setProfile(data.profile);
        setOrders(data.orders || []);
        setRestaurants(data.restaurants || []);
      })
      .catch((error) => toast(error instanceof Error ? error.message : "Failed to load profile", "danger"))
      .finally(() => setLoading(false));
  }, [params.resource, params.id, toast]);

  async function settleRiderAmounts(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await apiAdjustRiderAmounts(params.id, Number(duePaid || 0), Number(withdrawal || 0));
      setProfile((current) =>
        current ? { ...current, due_amount: result.due_amount, balance: result.balance } : current
      );
      setDuePaid("");
      setWithdrawal("");
      toast("Rider amounts updated successfully", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update amounts", "danger");
    }
  }

  const profileTitle = String(profile?.name || profile?.username || profile?.owner_id || "Profile details");

  return (
    <AppShell
      role="Admin panel"
      title="Profile details"
      subtitle="Account and activity data. Password data is never displayed."
      nav={adminNav}
    >
      <div className="space-y-6">
        <Panel className="space-y-6 p-6 sm:p-8">
          <SectionHeading eyebrow={params.resource} title={loading ? "Loading..." : profileTitle} />

          {profile && (
            <div className="space-y-6">
              {typeof profile.pfp === "string" && (
                <div className="flex items-center gap-4">
                  <Image
                    src={getImageUrl(profile.pfp)}
                    alt="Profile"
                    width={96}
                    height={96}
                    unoptimized
                    className="h-24 w-24 rounded-2xl object-cover ring-2 ring-amber-500/20 shadow-xs"
                  />
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{profileTitle}</h2>
                    <p className="text-xs uppercase tracking-wider text-slate-500">{params.resource.replace(/s$/, "")}</p>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {Object.entries(profile)
                  .filter(([key]) => !key.toLowerCase().includes("password") && key !== "pfp" && key !== "location")
                  .map(([key, value]) => (
                    <div key={key} className="rounded-2xl border border-black/5 bg-slate-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {key.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 font-medium text-slate-900 break-words">{String(value ?? "-")}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Panel>

        {params.resource === "riders" && profile && (
          <Panel className="space-y-5 p-6 sm:p-8">
            <SectionHeading
              eyebrow="Offline settlement"
              title="Rider amounts"
              description={`Due to platform: ৳${Number(profile.due_amount || 0).toFixed(2)} · Rider balance: ৳${Number(profile.balance || 0).toFixed(2)}`}
            />
            <form onSubmit={settleRiderAmounts} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
              <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Paid by rider order amount
                <input
                  min="0"
                  max={Number(profile.due_amount || 0)}
                  step="0.01"
                  type="number"
                  placeholder="0.00"
                  value={duePaid}
                  onChange={(event) => setDuePaid(event.target.value)}
                  className="w-full rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-normal text-slate-900 outline-none shadow-2xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </label>
              <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Withdrawal amount
                <input
                  min="0"
                  max={Number(profile.balance || 0)}
                  step="0.01"
                  type="number"
                  placeholder="0.00"
                  value={withdrawal}
                  onChange={(event) => setWithdrawal(event.target.value)}
                  className="w-full rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-normal text-slate-900 outline-none shadow-2xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </label>
              <button
                type="submit"
                className="self-end rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-amber-600"
              >
                Record payment
              </button>
            </form>
          </Panel>
        )}

        {params.resource === "owners" && (
          <Panel className="space-y-5 p-6 sm:p-8">
            <SectionHeading
              eyebrow="Owner portfolio"
              title="Restaurants"
              description={`${restaurants.length} restaurant${restaurants.length === 1 ? "" : "s"} linked to this owner.`}
            />
            {restaurants.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {restaurants.map((restaurant) => (
                  <Link
                    key={restaurant.restaurant_id}
                    href={`/admin/restaurants/${encodeURIComponent(restaurant.restaurant_id)}`}
                    className="flex items-center justify-between rounded-2xl border border-black/5 bg-slate-50/60 p-4 transition hover:bg-amber-50/70 hover:border-amber-200"
                  >
                    <div>
                      <span className="block font-semibold text-slate-900">{restaurant.name}</span>
                      <span className="mt-1 block font-mono text-xs text-slate-500">
                        {restaurant.restaurant_id} · {restaurant.open_time}–{restaurant.close_time}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        tone={
                          restaurant.status === "banned"
                            ? "danger"
                            : restaurant.status === "open"
                            ? "success"
                            : "warning"
                        }
                      >
                        {restaurant.status}
                      </Badge>
                      <span aria-hidden="true" className="text-slate-400">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">This owner has no restaurants yet.</p>
            )}
          </Panel>
        )}

        {orders.length > 0 && (
          <Panel className="space-y-6 p-6 sm:p-8">
            <SectionHeading eyebrow="Order history" title="Orders" description={`${orders.length} orders recorded.`} />
            <div className="divide-y divide-black/5">
              {orders.map((order) => (
                <article key={order.order_id} className="pt-5 first:pt-0 pb-5 last:pb-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/admin/orders?order_id=${encodeURIComponent(order.order_id)}`}
                      className="font-mono text-sm font-bold text-amber-700 hover:text-amber-800 hover:underline"
                    >
                      {order.order_id}
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          order.status === "delivered"
                            ? "success"
                            : order.status === "cancelled" || order.status === "rejected"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {order.status}
                      </Badge>
                      <span className="text-xs text-slate-500">{order.order_timestamp}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">
                    {order.restaurant_name ? (
                      <span>Restaurant: <strong className="text-slate-900">{order.restaurant_name}</strong></span>
                    ) : null}
                    {order.rider_name ? (
                      <span className="ml-2">· Rider: <strong className="text-slate-900">{order.rider_name}</strong></span>
                    ) : null}
                  </p>
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-black/5 bg-slate-50/90 p-4 font-mono text-xs leading-5 text-slate-800 shadow-2xs">
                    {order.bill}
                  </pre>
                </article>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
