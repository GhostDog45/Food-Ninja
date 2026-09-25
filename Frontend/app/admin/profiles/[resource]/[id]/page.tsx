"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Panel, SectionHeading } from "@/components/ui";
import { adminNav } from "@/lib/platform";
import { apiGetAdminProfile } from "@/lib/backend";

export default function AdminProfileDetailPage() {
  const params = useParams<{ resource: string; id: string }>();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { apiGetAdminProfile(params.resource, params.id).then(setProfile); }, [params.resource, params.id]);
  return <AppShell role="Admin panel" title="Profile details" subtitle="Password data is never displayed." nav={adminNav}><Panel className="space-y-4 p-6"><SectionHeading eyebrow={params.resource} title={String(profile?.name || profile?.username || profile?.owner_id || "Loading...")} />{profile && <div className="grid gap-3 sm:grid-cols-2">{Object.entries(profile).filter(([key]) => !key.toLowerCase().includes("password") && key !== "pfp" && key !== "location").map(([key, value]) => <div key={key} className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase text-slate-500">{key}</p><p className="text-sm text-slate-900">{String(value ?? "-")}</p></div>)}</div>}</Panel></AppShell>;
}
