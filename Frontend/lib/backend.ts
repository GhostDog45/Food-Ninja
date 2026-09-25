export type BackendMode = "live" | "demo";

export type BackendResponse<T> = {
  ok: boolean;
  mode: BackendMode;
  endpoint: string;
  data: T;
  message?: string;
};

export type AuthUser = {
  username: string;
  user_type: "user" | "admin" | "rider" | "owner";
  email?: string;
  name?: string;
  status?: string;
};

export type LoginPayload = {
  user_type: "user" | "admin" | "rider" | "owner";
  user_info: string;
  password: string;
};

export type UserRegisterPayload = {
  user_type: "user";
  username: string;
  name: string;
  email: string;
  phone: string;
  password: string;
};

export type RiderRegisterPayload = {
  user_type: "rider";
  username: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  vehicle: "bike" | "bicycle";
};

export type AdminRegisterPayload = {
  user_type: "admin";
  username: string;
  email: string;
  phone: string;
  password: string;
};

export type OwnerRegisterPayload = {
  user_type: "owner";
  username: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  nid?: string;
};

export type RegisterPayload = UserRegisterPayload | RiderRegisterPayload | AdminRegisterPayload | OwnerRegisterPayload;

export type LoginResponse = {
  success: boolean;
  token?: string;
  username?: string;
  user_type?: "user" | "admin" | "rider" | "owner";
  status?: string;
  message?: string;
};

export type RegisterResponse = {
  success: boolean;
  message?: string;
};

export type UpdateResponse = {
  success: boolean;
  message: string;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000";

export function getImageUrl(url?: string | null, fallback = "/placeholder-food.png"): string {
  if (!url || typeof url !== "string" || !url.trim()) return fallback;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  if (url.startsWith("/uploads/") || url.startsWith("uploads/")) {
    const cleanPath = url.startsWith("/") ? url : `/${url}`;
    return `${BACKEND_URL}${cleanPath}`;
  }
  return url.startsWith("/") ? url : `/${url}`;
}

// Auth token storage helpers (localStorage)
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("food_ninja_token");
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const user = sessionStorage.getItem("food_ninja_user");
  if (!user) return null;
  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
}

export function setAuthSession(token: string, user: AuthUser): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("food_ninja_token", token);
  sessionStorage.setItem("food_ninja_user", JSON.stringify(user));
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("food_ninja_token");
  sessionStorage.removeItem("food_ninja_user");
}

// Direct API calls to Flask Backend matching login.py exactly
export async function apiLogin(payload: LoginPayload): Promise<LoginResponse> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      "Backend server is offline or unreachable. Please ensure 'python app.py' is running in D:\\project\\Food-Ninja\\Backend."
    );
  }

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to log in");
  }

  if (data.token) {
    setAuthSession(data.token, {
      username: data.username || payload.user_info,
      user_type: data.user_type || payload.user_type,
      status: data.status,
    });
  }

  return data;
}

export async function apiLogout(): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch(`${BACKEND_URL}/logout`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    } catch {
      // If server is unreachable, continue clearing client session
    }
  }

  clearAuthSession();
  return { success: true, message: "Logged out successfully" };
}

export async function apiRegister(payload: RegisterPayload): Promise<RegisterResponse> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      "Cannot connect to the Flask Backend. Please ensure 'python app.py' is running on http://127.0.0.1:5000 in your Backend terminal."
    );
  }

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to register");
  }

  return data;
}

export async function apiUpdateEmail(newEmail: string, password: string): Promise<UpdateResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required. Please log in.");
  }

  const res = await fetch(`${BACKEND_URL}/users/me/email`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      new_email: newEmail,
      password: password,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to update email");
  }

  return data;
}

export async function apiUpdatePhone(newPhone: string, password: string): Promise<UpdateResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required. Please log in.");
  }

  const res = await fetch(`${BACKEND_URL}/users/me/phone`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      new_phone: newPhone,
      password: password,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to update phone number");
  }

  return data;
}

export async function apiChangePassword(oldPassword: string, newPassword: string): Promise<UpdateResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required. Please log in.");
  }

  const res = await fetch(`${BACKEND_URL}/users/me/password`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      old_password: oldPassword,
      new_password: newPassword,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to change password");
  }

  return data;
}

export async function apiGetPendingOrders() {
  const token = getAuthToken();
  if (!token) {
    throw new Error("User not authenticated. Please log in.");
  }

  const res = await fetch(`${BACKEND_URL}/pending_orders_user`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to fetch orders");
  }

  return data.orders || [];
}

// Universal platform request dispatcher
export async function submitPlatformRequest<T>(
  endpoint: string,
  payload: Record<string, unknown> = {},
): Promise<BackendResponse<T>> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${BACKEND_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        ok: true,
        mode: "live",
        endpoint,
        data: data as T,
      };
    }
  } catch {
    // If backend is unreachable or endpoint is not defined in Flask yet, fallback gracefully
  }

  return {
    ok: true,
    mode: "demo",
    endpoint,
    data: payload as T,
  };
}

// Update user/rider location via Flask Backend PostGIS endpoint
export async function apiUpdateLocation(payload: { latitude: number; longitude: number }): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required. Please log in.");
  }

  const res = await fetch(`${BACKEND_URL}/users/me/location`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to update location");
  }

  return data;
}

export async function apiGetLocation(): Promise<{
  success: boolean;
  has_location: boolean;
  latitude: number | null;
  longitude: number | null;
}> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/users/me/location`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to fetch location");
  return data;
}

export async function apiGetRiderStatus(): Promise<{ success: boolean; status: string; has_location: boolean; vehicle?: string | null; balance?: number }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");

  const res = await fetch(`${BACKEND_URL}/rider/status`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to fetch rider status");
  return data;
}

export type RiderOrder = {
  order_id: string;
  status: string;
  bill: string;
  order_timestamp: string;
  final_timestamp?: string | null;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_latitude: number;
  restaurant_longitude: number;
  customer_latitude: number;
  customer_longitude: number;
  customer_name?: string;
};

async function riderApi(path: string, method = "GET"): Promise<any> {
  const token = getAuthToken();
  if (!token) throw new Error("Rider authentication required");
  const res = await fetch(`${BACKEND_URL}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Rider request failed");
  return data;
}

export async function apiSetRiderAvailability(status: "online" | "offline"): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error("Rider authentication required");
  const res = await fetch(`${BACKEND_URL}/rider/availability`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to change availability");
}

export async function apiGetRiderOffers(): Promise<{ active_order: RiderOrder | null; offers: RiderOrder[] }> {
  const data = await riderApi("/rider/orders/offers");
  return { active_order: data.active_order || null, offers: data.offers || [] };
}

export async function apiAcceptRiderOrder(orderId: string): Promise<void> {
  await riderApi(`/rider/orders/${encodeURIComponent(orderId)}/accept`, "POST");
}

export async function apiRiderOrderAction(orderId: string, action: "pickup" | "delivered"): Promise<void> {
  await riderApi(`/rider/orders/${encodeURIComponent(orderId)}/${action}`, "POST");
}

export async function apiGetRiderHistory(): Promise<RiderOrder[]> {
  const data = await riderApi("/rider/history");
  return data.orders || [];
}

// Onboarding persistence helpers
export function isOnboarded(username: string): boolean {
  if (typeof window === "undefined" || !username) return false;
  return localStorage.getItem(`food_ninja_onboarded_${username}`) === "true";
}

export function setOnboarded(username: string, details?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !username) return;
  localStorage.setItem(`food_ninja_onboarded_${username}`, "true");
  if (details) {
    localStorage.setItem(`food_ninja_profile_${username}`, JSON.stringify(details));
  }
}

export function getOnboardingDetails(username: string): Record<string, unknown> | null {
  if (typeof window === "undefined" || !username) return null;
  const data = localStorage.getItem(`food_ninja_profile_${username}`);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Owner & Admin API helpers
export async function apiGetOwnerStatus(): Promise<{ success: boolean; status: string; name?: string; email?: string; phone?: string; nid?: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");

  const res = await fetch(`${BACKEND_URL}/owner/status`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch owner status");
  return data;
}

export type OwnerRestaurant = {
  restaurant_id: string;
  name: string;
  latitude: number;
  longitude: number;
  open_time: string;
  close_time: string;
  status: string;
};

export async function apiGetOwnerRestaurants(): Promise<OwnerRestaurant[]> {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const res = await fetch(`${BACKEND_URL}/owner/restaurants`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    return data.success && Array.isArray(data.restaurants) ? data.restaurants : [];
  } catch {
    return [];
  }
}

export async function apiCreateRestaurant(payload: {
  name: string;
  open_time: string;
  close_time: string;
  latitude: number;
  longitude: number;
}): Promise<{ success: boolean; message: string; restaurant?: OwnerRestaurant }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");

  const res = await fetch(`${BACKEND_URL}/owner/restaurants`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to create restaurant");
  }
  return data;
}

export type OwnerFood = {
  food_id: string;
  restaurant_id: string;
  category: string;
  name: string;
  price: number | string;
  discount: number | string;
  description?: string;
  subcategory?: string | null;
  picture_url?: string | null;
};

export async function apiGetFoodCategories(): Promise<string[]> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${BACKEND_URL}/owner/food-categories`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load food categories");
  return Array.isArray(data.categories) ? data.categories : [];
}

export async function apiAddFood(restaurantId: string, payload: Omit<OwnerFood, "food_id" | "restaurant_id">): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${BACKEND_URL}/owner/restaurants/${restaurantId}/foods`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to add food");
  return data;
}

export async function apiGetOwnerFoods(restaurantId: string): Promise<OwnerFood[]> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${BACKEND_URL}/owner/restaurants/${restaurantId}/foods`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load foods");
  return Array.isArray(data.foods) ? data.foods : [];
}

export async function apiDeleteFood(restaurantId: string, foodId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${BACKEND_URL}/owner/restaurants/${restaurantId}/foods/${foodId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to remove food");
}

export async function apiGetOwnerRestaurantDetail(restaurantId: string): Promise<{ restaurant: OwnerRestaurant; foods: OwnerFood[] }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${BACKEND_URL}/owner/restaurants/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load restaurant");
  return data;
}

export async function apiUpdateOwnerRestaurant(restaurantId: string, payload: { open_time: string; close_time: string; status: "open" | "closed" | "shutdown" }): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${BACKEND_URL}/owner/restaurants/${restaurantId}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to update restaurant");
}

export type OwnerOrder = {
  order_id: string;
  status: string;
  order_timestamp: string;
  final_timestamp?: string | null;
  bill: string;
  username: string;
  customer_name: string;
  customer_phone: string;
};

export async function apiGetOwnerRestaurantOrders(restaurantId: string): Promise<OwnerOrder[]> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${BACKEND_URL}/owner/restaurants/${restaurantId}/orders`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load restaurant orders");
  return Array.isArray(data.orders) ? data.orders : [];
}

export async function apiCancelOwnerOrder(restaurantId: string, orderId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${BACKEND_URL}/owner/restaurants/${restaurantId}/orders/${orderId}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to cancel order");
}

export async function apiUpdateOwnerFood(restaurantId: string, foodId: string, payload: Omit<OwnerFood, "food_id" | "restaurant_id" | "category">): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${BACKEND_URL}/owner/restaurants/${restaurantId}/foods/${foodId}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to update food");
}

export async function apiGetAdminRestaurantDetail(restaurantId: string): Promise<{ restaurant: Record<string, unknown>; foods: OwnerFood[] }> {
  const token = getAuthToken();
  if (!token) throw new Error("Admin authorization required");
  const res = await fetch(`${BACKEND_URL}/admin/restaurants/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load restaurant");
  return data;
}

export async function apiGetAdminProfile(resource: string, identifier: string): Promise<Record<string, unknown>> {
  const token = getAuthToken();
  if (!token) throw new Error("Admin authorization required");
  const res = await fetch(`${BACKEND_URL}/admin/profiles/${resource}/${encodeURIComponent(identifier)}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load profile");
  return data.profile;
}

export async function apiDeleteRestaurant(restaurantId: string): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");

  const res = await fetch(`${BACKEND_URL}/owner/restaurants/${restaurantId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to delete restaurant");
  }
  return data;
}

export async function apiGetAdminPendingOwners(): Promise<any[]> {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const res = await fetch(`${BACKEND_URL}/admin/pending_owners`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    return data.success && Array.isArray(data.owners) ? data.owners : [];
  } catch {
    return [];
  }
}

export async function apiGetAdminStatus(): Promise<{ success: boolean; status: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${BACKEND_URL}/admin/status`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to fetch admin status");
  return data;
}

export type AdminApprovalRow = {
  username: string;
  email: string;
  phone: string;
  status: string;
};

export async function apiGetPendingAdmins(): Promise<AdminApprovalRow[]> {
  const token = getAuthToken();
  if (!token) return [];
  const res = await fetch(`${BACKEND_URL}/admin/pending_admins`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to fetch admins");
  return Array.isArray(data.admins) ? data.admins : [];
}

export async function apiVerifyAdmin(username: string, status: "approved" | "banned" | "pending"): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Admin authorization required");
  const res = await fetch(`${BACKEND_URL}/admin/verify_admin`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, status }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to verify admin");
  return data;
}

export async function apiVerifyOwner(ownerId: string, status: "approved" | "rejected"): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Admin authorization required");

  const res = await fetch(`${BACKEND_URL}/admin/verify_owner`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ owner_id: ownerId, status })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to verify owner");
  }
  return data;
}

export async function apiGetAdminPendingRestaurants(): Promise<any[]> {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const res = await fetch(`${BACKEND_URL}/admin/pending_restaurants`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    return data.success && Array.isArray(data.restaurants) ? data.restaurants : [];
  } catch {
    return [];
  }
}

export async function apiVerifyRestaurant(restaurantId: string, status: "closed" | "banned" | "pending"): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Admin authorization required");

  const res = await fetch(`${BACKEND_URL}/admin/verify_restaurant`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ restaurant_id: restaurantId, status })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to verify restaurant");
  }
  return data;
}

export type AdminRiderRow = {
  username: string;
  name: string;
  email: string;
  phone: string;
  vehicle: string;
  status: string;
};

export async function apiGetAdminPendingRiders(): Promise<AdminRiderRow[]> {
  const token = getAuthToken();
  if (!token) return [];

  const res = await fetch(`${BACKEND_URL}/admin/pending_riders`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to fetch riders");
  return Array.isArray(data.riders) ? data.riders : [];
}

export async function apiVerifyRider(riderUsername: string, status: "offline" | "banned" | "pending"): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Admin authorization required");

  const res = await fetch(`${BACKEND_URL}/admin/verify_rider`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rider_username: riderUsername, status }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to verify rider");
  return data;
}

export type AdminUserRow = {
  username: string;
  name: string;
  email: string;
  phone: string;
  status: string;
};

export async function apiGetAdminUsers(): Promise<AdminUserRow[]> {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const res = await fetch(`${BACKEND_URL}/admin/users`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    return data.success && Array.isArray(data.users) ? data.users : [];
  } catch {
    return [];
  }
}

export type AdminDirectoryResource = "admins" | "owners" | "restaurants" | "riders" | "users";
export type AdminDirectoryStatus = "pending" | "approved" | "banned" | "active";

export async function apiGetAdminDirectory(
  resource: AdminDirectoryResource,
  status: AdminDirectoryStatus,
  search = "",
  offset = 0
): Promise<any[]> {
  const token = getAuthToken();
  if (!token) return [];

  const params = new URLSearchParams({ status, search, offset: String(offset) });
  const res = await fetch(`${BACKEND_URL}/admin/directory/${resource}?${params.toString()}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load admin directory");
  return Array.isArray(data[resource]) ? data[resource] : [];
}

export type AdminSummary = Record<string, number>;

export async function apiGetAdminSummary(): Promise<AdminSummary> {
  const token = getAuthToken();
  if (!token) throw new Error("Admin authorization required");
  const res = await fetch(`${BACKEND_URL}/admin/summary`, { headers: { "Authorization": `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load admin summary");
  return data.summary || {};
}

export async function apiSetAdminDirectoryStatus(
  resource: AdminDirectoryResource,
  identifier: string,
  status: string
): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Admin authorization required");
  const res = await fetch(`${BACKEND_URL}/admin/directory/${resource}/status`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, status }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to update status");
  return data;
}

// ---------------------------------------------------------------------------
// Customer User Portal Endpoints & Types
// ---------------------------------------------------------------------------

export type CustomerNearbyRestaurant = {
  restaurant_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  open_time: string | null;
  close_time: string | null;
  status: string;
  distance_meters: number;
  distance_km: number;
  delivery_time_mins?: number;
  rating: number;
  review_count: number;
  people_ordered_count: number;
  total_orders_count: number;
};

export type CustomerFood = {
  food_id: string;
  restaurant_id: string;
  category: string;
  name: string;
  price: number;
  discount: number;
  discounted_price: number;
  description: string;
  subcategory: string;
  picture_url?: string | null;
};

export type CustomerRestaurantDetail = CustomerNearbyRestaurant & {
  within_5km: boolean;
  foods: CustomerFood[];
};

export type CustomerSearchResult = {
  food_id: string;
  food_name: string;
  category: string;
  price: number;
  discount: number;
  discounted_price: number;
  description: string;
  subcategory: string;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_status: string;
  distance_meters: number;
  distance_km: number;
  restaurant_rating: number;
  people_ordered_count: number;
  picture_url?: string | null;
};

export type CartItemData = {
  food_id: string;
  name: string;
  category: string;
  description?: string;
  price: number;
  discount: number;
  unit_price: number;
  quantity: number;
  item_total: number;
  picture_url?: string | null;
};

export type CartData = {
  cart_id: string;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_status?: string;
  status: string;
  items: CartItemData[];
  subtotal: number;
  delivery_fee: number;
  total: number;
};

export type DeliveryEstimate = {
  estimated_delivery_mins: number;
  delivery_time_range: string;
  estimated_arrival_time: string;
  distance_km: number;
  distance_meters: number;
  vehicle: "bike" | "bicycle";
  vehicle_label: string;
  traffic_condition: string;
  traffic_jam_detected: boolean;
  traffic_delay_mins: number;
  kitchen_prep_mins: number;
  transit_mins: number;
};

export type CustomerOrder = {
  order_id: string;
  status: string;
  bill: string;
  total_amount?: string;
  order_timestamp: string;
  final_timestamp: string | null;
  payment_method: string;
  payment_status: string;
  transaction_id: string;
  restaurant_id: string;
  restaurant_name: string;
  latitude: number | null;
  longitude: number | null;
  distance_meters?: number;
  distance_km?: number;
  rider_name?: string | null;
  rider_phone?: string | null;
  rider_vehicle?: "bike" | "bicycle" | null;
  rider_username?: string | null;
  delivery_estimate?: DeliveryEstimate;
  items?: CartItemData[];
  review?: {
    rider_rating?: number | null;
    rider_review?: string | null;
    restaurant_rating?: number | null;
    restaurant_review?: string | null;
    timestamp?: string | null;
  } | null;
};

export async function apiGetUserNearbyRestaurants(params?: {
  latitude?: number;
  longitude?: number;
  sort?: string;
}): Promise<{
  restaurants: CustomerNearbyRestaurant[];
  user_location?: { latitude: number; longitude: number };
  message?: string;
}> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const queryParams = new URLSearchParams();
  if (params?.latitude !== undefined && params?.longitude !== undefined) {
    queryParams.set("latitude", String(params.latitude));
    queryParams.set("longitude", String(params.longitude));
  }
  if (params?.sort) {
    queryParams.set("sort", params.sort);
  }

  const res = await fetch(`${BACKEND_URL}/user/nearby_restaurants?${queryParams.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load nearby restaurants");
  return {
    restaurants: Array.isArray(data.restaurants) ? data.restaurants : [],
    user_location: data.user_location,
    message: data.message,
  };
}

export async function apiGetUserRestaurantDetail(restaurantId: string, coords?: { latitude?: number; longitude?: number }): Promise<CustomerRestaurantDetail> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const params = new URLSearchParams();
  if (coords?.latitude !== undefined && coords?.longitude !== undefined) {
    params.set("latitude", String(coords.latitude));
    params.set("longitude", String(coords.longitude));
  }

  const res = await fetch(`${BACKEND_URL}/user/restaurants/${encodeURIComponent(restaurantId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load restaurant details");
  return data.restaurant;
}

export async function apiGetUserCategories(): Promise<string[]> {
  const res = await fetch(`${BACKEND_URL}/user/categories`);
  const data = await res.json();
  if (!res.ok || !data.success) return [];
  return Array.isArray(data.categories) ? data.categories : [];
}

export async function apiSearchUserFoods(query: string, category?: string, coords?: { latitude?: number; longitude?: number }): Promise<CustomerSearchResult[]> {
  const token = getAuthToken();
  if (!token) return [];

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (category) params.set("category", category);
  if (coords?.latitude !== undefined && coords?.longitude !== undefined) {
    params.set("latitude", String(coords.latitude));
    params.set("longitude", String(coords.longitude));
  }

  try {
    const res = await fetch(`${BACKEND_URL}/user/foods/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) return [];
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

export async function apiGetUserFoodDetail(foodId: string): Promise<any> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/user/foods/${encodeURIComponent(foodId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load food details");
  return data.food;
}

export async function apiGetUserCart(): Promise<{ has_cart: boolean; cart: CartData | null }> {
  const token = getAuthToken();
  if (!token) return { has_cart: false, cart: null };

  const res = await fetch(`${BACKEND_URL}/user/cart`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to fetch cart");
  return { has_cart: Boolean(data.has_cart), cart: data.cart || null };
}

export async function apiAddToCart(foodId: string, quantity = 1, replace = false): Promise<{ success: boolean; message: string; conflict?: boolean; existing_restaurant?: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/user/cart/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ food_id: foodId, quantity, replace }),
  });
  const data = await res.json();
  if (!res.ok && res.status !== 409) {
    throw new Error(data.message || "Failed to add food to cart");
  }
  return data;
}

export async function apiUpdateCartItemQty(foodId: string, quantity: number): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/user/cart/items`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ food_id: foodId, quantity }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to update item quantity");
}

export async function apiRemoveCartItem(foodId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/user/cart/items/${encodeURIComponent(foodId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to remove item from cart");
}

export async function apiDeleteUserCart(): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/user/cart`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to delete cart");
}

export async function apiCheckoutUserCart(payload?: {
  payment_method?: "Cash on delivery";
  latitude?: number;
  longitude?: number;
  food_preparing_notes?: string;
  delivery_notes?: string;
}): Promise<{
  success: boolean;
  message: string;
  order_id: string;
  status: string;
  bill: string;
  payment_method: string;
  restaurant_name: string;
  delivery_estimate?: DeliveryEstimate;
  rider?: {
    name: string;
    vehicle: "bike" | "bicycle";
    phone?: string | null;
  } | null;
}> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/user/cart/checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment_method: "Cash on delivery",
      ...(payload || {}),
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Checkout failed");
  return data;
}

export async function apiGetUserOrders(): Promise<CustomerOrder[]> {
  const token = getAuthToken();
  if (!token) return [];

  const res = await fetch(`${BACKEND_URL}/user/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) return [];
  return Array.isArray(data.orders) ? data.orders : [];
}

export async function apiGetUserOrderDetail(orderId: string): Promise<CustomerOrder> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/user/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load order");
  return data.order;
}

export async function apiSubmitOrderReview(
  orderId: string,
  payload: {
    restaurant_rating: number;
    restaurant_review?: string;
    rider_rating?: number;
    rider_review?: string;
  }
): Promise<{ success: boolean; message: string; review: any }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/user/orders/${encodeURIComponent(orderId)}/review`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to submit review");
  return data;
}

export async function apiCompleteOrder(orderId: string): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/user/orders/${encodeURIComponent(orderId)}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to mark order as delivered");
  return data;
}

export async function apiConfirmOrderPickup(orderId: string): Promise<{ success: boolean; message: string; status: string; rider_username?: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/user/orders/${encodeURIComponent(orderId)}/pickup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to confirm pickup");
  return data;
}

// ---------------------------------------------------------------------------
// Image Uploads, Profile Details & Categories
// ---------------------------------------------------------------------------

export type FoodCategory = {
  category: string;
  picture_url?: string | null;
};

export async function apiGetUserCategoriesDetail(): Promise<FoodCategory[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/user/categories`);
    const data = await res.json();
    if (!res.ok || !data.success) return [];
    if (Array.isArray(data.categories_detail)) {
      return data.categories_detail;
    }
    if (Array.isArray(data.categories)) {
      return data.categories.map((c: string) => ({ category: c, picture_url: null }));
    }
    return [];
  } catch {
    return [];
  }
}

export type UserProfile = {
  username: string;
  name: string;
  email: string;
  phone: string;
  pfp_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  reg_date?: string;
};

export async function apiGetUserProfile(): Promise<UserProfile> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/users/me/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load profile");
  return data.profile;
}

export async function apiUploadUserPfp(file: File): Promise<{ success: boolean; message: string; pfp_url: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  if (file.size > 5 * 1024 * 1024) {
    throw new Error(`File size exceeds 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select a smaller image.`);
  }

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BACKEND_URL}/users/me/pfp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to upload profile picture");
  return data;
}

export type RiderProfile = {
  username: string;
  name: string;
  email: string;
  phone: string;
  vehicle: "bike" | "bicycle";
  balance: number;
  pfp_url?: string | null;
  status: string;
  reg_date?: string;
};

export async function apiGetRiderProfile(): Promise<RiderProfile> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  const res = await fetch(`${BACKEND_URL}/rider/me/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to load rider profile");
  return data.profile;
}

export async function apiUploadRiderPfp(file: File): Promise<{ success: boolean; message: string; pfp_url: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  if (file.size > 5 * 1024 * 1024) {
    throw new Error(`File size exceeds 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select a smaller image.`);
  }

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BACKEND_URL}/rider/me/pfp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to upload rider profile picture");
  return data;
}

export async function apiUploadFoodPicture(restaurantId: string, foodId: string, file: File): Promise<{ success: boolean; message: string; picture_url: string }> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required. Please log in.");

  if (file.size > 5 * 1024 * 1024) {
    throw new Error(`File size exceeds 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select a smaller image.`);
  }

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BACKEND_URL}/owner/restaurants/${encodeURIComponent(restaurantId)}/foods/${encodeURIComponent(foodId)}/picture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Failed to upload food picture");
  return data;
}




