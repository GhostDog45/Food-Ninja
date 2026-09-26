"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Panel, SectionHeading } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { apiUploadFoodCategory } from "@/lib/backend";
import { adminNav } from "@/lib/platform";

export default function AdminCategoriesPage() {
  const [category, setCategory] = useState("");
  const [picture, setPicture] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!picture) {
      toast("Choose a category picture", "warning");
      return;
    }
    setSaving(true);
    try {
      await apiUploadFoodCategory(category.trim(), picture);
      setCategory("");
      setPicture(null);
      const input = document.getElementById("category-picture") as HTMLInputElement | null;
      if (input) input.value = "";
      toast("Food category saved", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save category", "danger");
    } finally {
      setSaving(false);
    }
  }

  return <AppShell role="Admin panel" title="Food categories" subtitle="Create or update a category and its picture." nav={adminNav}>
    <Panel className="max-w-2xl space-y-5 p-6">
      <SectionHeading eyebrow="Catalog" title="Add food category" />
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1 text-sm font-medium">Category name<input required maxLength={50} value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2" /></label>
        <label className="block space-y-1 text-sm font-medium">Category picture<input id="category-picture" required type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setPicture(event.target.files?.[0] || null)} className="mt-1 block w-full text-sm" /></label>
        <button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save category"}</button>
      </form>
    </Panel>
  </AppShell>;
}