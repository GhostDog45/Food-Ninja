"use client";

import { useEffect, useState } from "react";

export default function Loading() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only display loading wheel if loading takes more than 1 second (1000ms)
    const timer = setTimeout(() => {
      setVisible(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/10 backdrop-blur-[2px] transition-all duration-300"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-black/10 bg-white/95 px-6 py-5 shadow-xl backdrop-blur-md">
        <div className="relative flex h-8 w-8 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-[2.5px] border-amber-200 border-t-amber-500 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-slate-700 tracking-wide">Loading...</p>
      </div>
    </div>
  );
}
