"use client";

import { useEffect } from "react";
import { clearAuthSession } from "@/lib/backend";

export function SessionBootstrap() {
  useEffect(() => {
    clearAuthSession();
  }, []);

  return null;
}
