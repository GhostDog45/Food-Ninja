"use client";

import { AdminDirectory } from "@/components/admin-directory";

export default function AdminUsersPage() {
  return <AdminDirectory resource="users" title="Users" description="Search and manage customer accounts." />;
}
