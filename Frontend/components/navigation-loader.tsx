"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSlowLoading, setIsSlowLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear loading state when pathname or searchParams changes
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsSlowLoading(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore anchor jumps, new tabs, and external links
      if (
        href.startsWith("#") ||
        target.target === "_blank" ||
        target.hasAttribute("download") ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Check if it's an internal relative navigation
      try {
        const url = new URL(href, window.location.href);
        if (url.origin === window.location.origin) {
          const currentUrl = new URL(window.location.href);
          // If navigating to a different path or different search query
          if (url.pathname !== currentUrl.pathname || url.search !== currentUrl.search) {
            if (timerRef.current) clearTimeout(timerRef.current);
            // Only show loader if the transition takes more than 1 second (1000ms)
            timerRef.current = setTimeout(() => {
              setIsSlowLoading(true);
            }, 1000);
          }
        }
      } catch {
        // invalid URL, ignore
      }
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!isSlowLoading) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/10 backdrop-blur-[2px] transition-all duration-300"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-black/10 bg-white/95 px-6 py-5 shadow-xl backdrop-blur-md">
        {/* Minimal Modern Loading Wheel */}
        <div className="relative flex h-8 w-8 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-[2.5px] border-amber-200 border-t-amber-500 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-slate-700 tracking-wide">Loading...</p>
      </div>
    </div>
  );
}
