export type NavItem = {
  href: string;
  label: string;
  hint: string;
};

export const landingRestaurants = [
  { name: "Sushi Orbit", cuisine: "Japanese", eta: "18 min", rating: "4.9", accent: "from-cyan-500 to-blue-600" },
  { name: "Naan District", cuisine: "Indian", eta: "22 min", rating: "4.8", accent: "from-orange-500 to-amber-400" },
  { name: "Green Fork", cuisine: "Healthy", eta: "16 min", rating: "4.7", accent: "from-emerald-400 to-teal-500" },
];

export const ownerNav: NavItem[] = [
  { href: "/owner/dashboard", label: "View Restaurants", hint: "Approved restaurants" },
  { href: "/owner/pending", label: "Pending Restaurants", hint: "Cancel deployments" },
  { href: "/owner/deploy", label: "Deploy New Restaurant", hint: "Submit for approval" },
];

export const riderNav: NavItem[] = [
  { href: "/rider/dashboard", label: "Dashboard", hint: "Availability and map" },
  { href: "/rider/history", label: "Delivered Orders", hint: "Past deliveries" },
  { href: "/rider/profile", label: "Profile", hint: "Vehicle and rating" },
];

export const adminNav: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", hint: "Platform overview" },
  { href: "/admin/orders", label: "Search Order", hint: "Find by order ID" },
  { href: "/admin/categories", label: "Food Categories", hint: "Add categories and pictures" },
  { href: "/admin/admins", label: "Admins", hint: "Admin approvals" },
  { href: "/admin/users", label: "Users", hint: "Customer accounts" },
  { href: "/admin/owners", label: "Restaurant Owners", hint: "Partner approvals" },
  { href: "/admin/restaurants", label: "Restaurants", hint: "Kitchen approvals" },
  { href: "/admin/riders", label: "Riders", hint: "Delivery fleet" },
];

export const customerNav: NavItem[] = [
  { href: "/home", label: "Home", hint: "Feed and search" },
  { href: "/checkout", label: "Checkout", hint: "Cart review" },
  { href: "/orders", label: "My Orders", hint: "Live tracking & receipts" },
  { href: "/profile", label: "Profile", hint: "Account & address" },
];
