"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/ui";
import { getAuthUser, apiGetOwnerStatus } from "@/lib/backend";
import { ownerNav } from "@/lib/platform";

export default function OwnerLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "approved" | "pending" | "banned" | "blocked">("loading");

  useEffect(() => {
    const user = getAuthUser();
    if (!user || user.user_type !== "owner") {
      setState("blocked");
      router.replace("/login?role=owner");
      return;
    }

    apiGetOwnerStatus()
      .then((data) => setState(data.status === "approved" ? "approved" : data.status === "banned" ? "banned" : "pending"))
      .catch(() => setState("pending"));
  }, [router]);

  if (state === "loading") {
    return <div className="min-h-screen bg-[#f6f1e8] flex items-center justify-center text-sm text-slate-600">Checking owner approval...</div>;
  }

  if (state === "blocked") return null;

  if (state === "banned") {
    return <div className="min-h-screen bg-[#f6f1e8] flex items-center justify-center p-4"><Panel className="max-w-xl space-y-3 p-10 text-center"><h1 className="text-2xl font-bold text-slate-900">this account is permanently banned</h1><p className="text-sm text-slate-600">Owner portal access is forbidden.</p></Panel></div>;
  }

  if (state === "pending") {
    return (
      <AppShell role="Restaurant Owner" title="Waiting for approval" subtitle="Your owner application is being reviewed by an administrator." nav={[{ href: "/owner/dashboard", label: "Approval Status", hint: "Review queue" }]}>
        <Panel className="mx-auto max-w-xl space-y-4 p-10 text-center">
          <div className="text-4xl">⏳</div>
          <h1 className="text-2xl font-bold text-slate-900">Waiting for approval</h1>
          <p className="text-sm text-slate-600">Owner tools will become available after an admin approves your account.</p>
        </Panel>
      </AppShell>
    );
  }

  return <>{children}</>;
}
