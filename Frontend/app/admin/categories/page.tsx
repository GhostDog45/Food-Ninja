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

  return (
    <AppShell
      role="Admin panel"
      title="Food categories"
      subtitle="Create or update a category and its picture."
      nav={adminNav}
    >
      <Panel className="max-w-2xl space-y-6 p-6 sm:p-8">
        <SectionHeading eyebrow="Catalog management" title="Add food category" description="Upload a high-quality picture and unique category name for the Dhaka restaurant menu catalog." />
        <form onSubmit={submit} className="space-y-5">
          <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
            <span>Category Name *</span>
            <input
              required
              maxLength={50}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="e.g. Biriyani, Desserts, Fast Food"
              className="w-full rounded-2xl border border-black/10 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
            />
          </label>

          <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
            <span>Category Picture * (JPG, PNG, WebP)</span>
            <input
              id="category-picture"
              required
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => setPicture(event.target.files?.[0] || null)}
              className="block w-full text-xs text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-amber-500 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white file:shadow-xs hover:file:bg-amber-600 cursor-pointer"
            />
          </label>

          <button
            disabled={saving}
            className="rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? "Saving category..." : "Save category"}
          </button>
        </form>
      </Panel>
    </AppShell>
  );
}