"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HotelNav } from "@/components/hotel/hotel-nav";
import {
  UtensilsCrossed,
  Sparkles,
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Home,
  ShieldCheck,
  Building2,
  ChevronRight,
  X,
  Plus,
  ArrowRight,
  Flame,
  Coffee,
  Check,
  ChefHat,
  Truck,
  Ban,
  PackageCheck,
  Settings2,
  SlidersHorizontal,
  Bell,
  Search,
  Filter,
} from "lucide-react";
import { getStaffAuthHeaders } from "@/lib/hotel/client-auth";

interface MenuItemDto {
  itemId: string;
  categoryId: string;
  name: string;
  description: string | null;
  sku: string | null;
  basePrice: string;
  taxRate: string | null;
  isAvailable: boolean;
  fulfillmentStation: string | null;
}

interface MenuCategoryDto {
  categoryId: string;
  name: string;
  description: string | null;
  displayOrder: number;
  items: MenuItemDto[];
}

interface OrderLineItemDto {
  orderItemId: string;
  itemId: string;
  itemName: string;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  specialNotes?: string | null;
}

interface StaffOrderDto {
  orderId: string;
  orderNumber: string;
  roomNumber: string;
  guestName: string | null;
  status: "PLACED" | "ACCEPTED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
  displayStatus: string;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  createdAt: string;
  items: OrderLineItemDto[];
}

function RoomServiceStaffWorkspaceContent() {
  const searchParams = useSearchParams();
  const outletIdParam = searchParams.get("outletId");

  const [outletId, setOutletId] = useState<string | null>(outletIdParam);
  const [orders, setOrders] = useState<StaffOrderDto[]>([]);
  const [categories, setCategories] = useState<MenuCategoryDto[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Initial Property & Outlet Resolution
  useEffect(() => {
    async function initProperty() {
      try {
        const auth = await getStaffAuthHeaders();
        const res = await fetch("/api/v1/hotel/properties", { headers: auth });
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setOutletId((prev) => prev || json.data[0].outletId);
        }
      } catch (err) {
        setErrorMessage("Failed to resolve hotel property context.");
      }
    }
    initProperty();
  }, []);

  // 2. Fetch Staff Orders
  const fetchOrders = useCallback(async () => {
    if (!outletId) return;
    try {
      const auth = await getStaffAuthHeaders();
      const res = await fetch(`/api/v1/hotel/room-service/orders?outletId=${outletId}`, {
        headers: auth,
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setOrders(json.data);
      } else {
        setErrorMessage(json.error?.message || "Failed to load orders.");
      }
    } catch {
      setErrorMessage("Network error fetching room service orders.");
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  // 3. Fetch Menu Catalog (for availability drawer)
  const fetchMenu = useCallback(async () => {
    if (!outletId) return;
    try {
      const auth = await getStaffAuthHeaders();
      const res = await fetch(`/api/v1/hotel/room-service/menu?outletId=${outletId}`, {
        headers: auth,
      });
      const json = await res.json();
      if (json.success && json.data?.categories) {
        setCategories(json.data.categories);
      }
    } catch {
      // Menu fetch fallback
    }
  }, [outletId]);

  useEffect(() => {
    if (outletId) {
      fetchOrders();
      fetchMenu();
    }
  }, [outletId, fetchOrders, fetchMenu]);

  // 4. Connect Staff Realtime SSE Stream
  useEffect(() => {
    if (!outletId) return;

    let eventSource: EventSource | null = null;
    try {
      getStaffAuthHeaders().then((auth: Record<string, string>) => {
        const token = auth.Authorization ? auth.Authorization.replace("Bearer ", "") : "";
        if (token) {
          eventSource = new EventSource(`/api/v1/customer/realtime?auth=${encodeURIComponent(token)}`);
          const refresh = () => fetchOrders();
          eventSource.addEventListener("order.created", refresh);
          eventSource.addEventListener("order.accepted", refresh);
          eventSource.addEventListener("order.preparing", refresh);
          eventSource.addEventListener("order.ready", refresh);
          eventSource.addEventListener("order.out_for_delivery", refresh);
          eventSource.addEventListener("order.delivered", refresh);
          eventSource.addEventListener("order.cancelled", refresh);
        }
      });
    } catch {
      // SSE fallback
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [outletId, fetchOrders]);

  // Handle Order Status Progression
  const handleUpdateStatus = async (orderId: string, nextStatus: StaffOrderDto["status"]) => {
    if (!outletId) return;
    setUpdatingOrderId(orderId);
    try {
      const auth = await getStaffAuthHeaders();
      const res = await fetch(`/api/v1/hotel/room-service/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...auth,
        },
        body: JSON.stringify({
          outletId,
          status: nextStatus,
        }),
      });

      const json = await res.json();
      if (json.success) {
        await fetchOrders();
      } else {
        alert(json.error?.message || "Failed to update order status.");
      }
    } catch {
      alert("Network error updating status.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Toggle Menu Item 86 / Availability
  const handleToggleItemAvailability = async (itemId: string, currentAvailability: boolean) => {
    if (!outletId) return;
    setTogglingItemId(itemId);
    try {
      const auth = await getStaffAuthHeaders();
      const res = await fetch(`/api/v1/hotel/room-service/menu/${itemId}/availability`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...auth,
        },
        body: JSON.stringify({
          outletId,
          isAvailable: !currentAvailability,
        }),
      });

      const json = await res.json();
      if (json.success) {
        await fetchMenu();
      } else {
        alert(json.error?.message || "Failed to toggle availability.");
      }
    } catch {
      alert("Network error toggling menu item.");
    } finally {
      setTogglingItemId(null);
    }
  };

  // Filtering & Metrics
  const activeOrders = orders.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED");
  const newOrders = orders.filter((o) => o.status === "PLACED");
  const kitchenOrders = orders.filter((o) => o.status === "ACCEPTED" || o.status === "PREPARING");
  const readyOrders = orders.filter((o) => o.status === "READY");
  const enRouteOrders = orders.filter((o) => o.status === "OUT_FOR_DELIVERY");
  const completedOrders = orders.filter((o) => o.status === "DELIVERED");

  const filteredOrders = orders.filter((ord) => {
    const matchesSearch =
      searchQuery === "" ||
      ord.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ord.roomNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ord.guestName && ord.guestName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      ord.items.some((i) => i.itemName.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === "ACTIVE") return ord.status !== "DELIVERED" && ord.status !== "CANCELLED";
    if (statusFilter === "NEW") return ord.status === "PLACED";
    if (statusFilter === "KITCHEN") return ord.status === "ACCEPTED" || ord.status === "PREPARING";
    if (statusFilter === "READY") return ord.status === "READY";
    if (statusFilter === "EN_ROUTE") return ord.status === "OUT_FOR_DELIVERY";
    if (statusFilter === "DELIVERED") return ord.status === "DELIVERED";
    if (statusFilter === "CANCELLED") return ord.status === "CANCELLED";
    return true;
  });

  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-amber-500 selection:text-white">
      <HotelNav />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Top Header & Operational Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Room Service & F&B Fulfillment
                </h1>
                <p className="text-xs text-muted-foreground">
                  Operational kitchen dispatch, guest dining orders, and live menu availability management.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsMenuDrawerOpen(true)}
              className="py-2.5 px-4 rounded-xl bg-card hover:bg-muted border border-border text-foreground font-semibold text-xs transition flex items-center space-x-2 shadow-sm"
            >
              <SlidersHorizontal className="w-4 h-4 text-amber-500" />
              <span>Menu Availability (86)</span>
            </button>

            <button
              onClick={fetchOrders}
              className="py-2.5 px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition flex items-center space-x-1.5 shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Operational Metrics Cards */}
        <section aria-label="Kitchen order counters" className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          <div className="bg-card border border-border rounded-2xl p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>New Orders</span>
              <Bell className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">{newOrders.length}</div>
            <div className="text-[10px] text-amber-500 font-semibold">Requires Acceptance</div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>In Kitchen</span>
              <ChefHat className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">{kitchenOrders.length}</div>
            <div className="text-[10px] text-blue-500 font-semibold">Cooking & Prep</div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Ready for Tray</span>
              <PackageCheck className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">{readyOrders.length}</div>
            <div className="text-[10px] text-indigo-500 font-semibold">Plated & Packed</div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Out for Delivery</span>
              <Truck className="w-3.5 h-3.5 text-sky-500" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">{enRouteOrders.length}</div>
            <div className="text-[10px] text-sky-500 font-semibold">En Route to Room</div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-1 shadow-sm col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Delivered Today</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">{completedOrders.length}</div>
            <div className="text-[10px] text-emerald-500 font-semibold">Fulfilled Orders</div>
          </div>
        </section>

        {/* Filters & Search Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-border">
          {/* Status Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: "ACTIVE", label: `Active (${activeOrders.length})` },
              { id: "NEW", label: `New (${newOrders.length})` },
              { id: "KITCHEN", label: `Cooking (${kitchenOrders.length})` },
              { id: "READY", label: `Ready (${readyOrders.length})` },
              { id: "EN_ROUTE", label: `En Route (${enRouteOrders.length})` },
              { id: "DELIVERED", label: `Delivered (${completedOrders.length})` },
              { id: "ALL", label: `All (${orders.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  statusFilter === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search room, order, item..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
            />
          </div>
        </div>

        {/* Orders Grid / Kanban */}
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">Loading room service orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-card border border-border rounded-3xl p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-foreground">No orders in this view</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              New customer room-service orders placed from in-room QR codes will appear here automatically in real-time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((ord) => {
              const isUpdating = updatingOrderId === ord.orderId;

              return (
                <article
                  key={ord.orderId}
                  className={`bg-card border rounded-3xl p-5 space-y-4 shadow-sm flex flex-col justify-between transition-all duration-200 ${
                    ord.status === "PLACED"
                      ? "border-amber-500/40 ring-1 ring-amber-500/20 bg-amber-500/[0.02]"
                      : ord.status === "READY" || ord.status === "OUT_FOR_DELIVERY"
                      ? "border-sky-500/40 bg-sky-500/[0.02]"
                      : "border-border"
                  }`}
                >
                  {/* Card Header: Room & Order Reference */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold text-sm flex items-center space-x-1.5">
                          <Home className="w-3.5 h-3.5" />
                          <span>Room {ord.roomNumber}</span>
                        </div>
                        {ord.guestName && (
                          <span className="text-xs font-semibold text-foreground truncate max-w-[130px]">
                            {ord.guestName}
                          </span>
                        )}
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                          ord.status === "DELIVERED"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : ord.status === "CANCELLED"
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                            : ord.status === "READY"
                            ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                            : ord.status === "OUT_FOR_DELIVERY"
                            ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 animate-pulse"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                        }`}
                      >
                        {ord.displayStatus}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                      <span className="font-mono font-bold text-foreground">{ord.orderNumber}</span>
                      <span>{new Date(ord.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>

                  {/* Items Order Lines */}
                  <div className="space-y-1.5 bg-muted/40 p-3.5 rounded-2xl border border-border/60 text-xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/40">
                      Ordered Items ({ord.items.reduce((s, i) => s + i.quantity, 0)})
                    </div>
                    <div className="space-y-1 divide-y divide-border/30 max-h-36 overflow-y-auto pr-1">
                      {ord.items.map((line) => (
                        <div key={line.orderItemId} className="pt-1 first:pt-0 flex items-start justify-between">
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-amber-500">{line.quantity}x</span>
                              <span className="font-semibold text-foreground">{line.itemName}</span>
                            </div>
                            {line.specialNotes && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                                Note: {line.specialNotes}
                              </div>
                            )}
                          </div>
                          <span className="font-mono text-muted-foreground shrink-0">₹{line.subtotal}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pricing Total & Operational Action */}
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Order Total (incl. 5% tax):</span>
                      <span className="font-extrabold text-foreground font-mono text-sm">₹{ord.totalAmount}</span>
                    </div>

                    {/* Operational Next Action Buttons */}
                    <div className="space-y-1.5">
                      {ord.status === "PLACED" && (
                        <button
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(ord.orderId, "ACCEPTED")}
                          className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition shadow-sm flex items-center justify-center space-x-2"
                        >
                          <Check className="w-4 h-4" />
                          <span>Accept & Send to Kitchen</span>
                        </button>
                      )}

                      {ord.status === "ACCEPTED" && (
                        <button
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(ord.orderId, "PREPARING")}
                          className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-sm flex items-center justify-center space-x-2"
                        >
                          <ChefHat className="w-4 h-4" />
                          <span>Start Cooking / Preparation</span>
                        </button>
                      )}

                      {ord.status === "PREPARING" && (
                        <button
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(ord.orderId, "READY")}
                          className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-sm flex items-center justify-center space-x-2"
                        >
                          <PackageCheck className="w-4 h-4" />
                          <span>Mark Ready on Tray</span>
                        </button>
                      )}

                      {ord.status === "READY" && (
                        <button
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(ord.orderId, "OUT_FOR_DELIVERY")}
                          className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition shadow-sm flex items-center justify-center space-x-2"
                        >
                          <Truck className="w-4 h-4" />
                          <span>Dispatch / Out for Delivery</span>
                        </button>
                      )}

                      {ord.status === "OUT_FOR_DELIVERY" && (
                        <button
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(ord.orderId, "DELIVERED")}
                          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm flex items-center justify-center space-x-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Mark Delivered to Room</span>
                        </button>
                      )}

                      {ord.status === "DELIVERED" && (
                        <div className="py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center space-x-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Order Completed & Delivered</span>
                        </div>
                      )}

                      {ord.status === "CANCELLED" && (
                        <div className="py-2 px-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center justify-center space-x-1.5">
                          <Ban className="w-3.5 h-3.5" />
                          <span>Order Cancelled</span>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Slide-Out Menu Availability (86) Drawer */}
      {isMenuDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-card border-l border-border h-full p-6 space-y-6 overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Menu Availability (86)</h3>
                  <p className="text-xs text-muted-foreground">Toggle sold-out items instantly</p>
                </div>
              </div>
              <button
                onClick={() => setIsMenuDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Catalog Categories & Items */}
            <div className="space-y-6">
              {categories.map((category) => (
                <div key={category.categoryId} className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {category.name}
                  </h4>

                  <div className="space-y-2">
                    {category.items.map((item) => {
                      const isToggling = togglingItemId === item.itemId;

                      return (
                        <div
                          key={item.itemId}
                          className="bg-muted/40 border border-border/60 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-foreground">{item.name}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              ₹{parseFloat(item.basePrice).toFixed(2)} • {item.fulfillmentStation}
                            </div>
                          </div>

                          <button
                            disabled={isToggling}
                            onClick={() => handleToggleItemAvailability(item.itemId, item.isAvailable)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm ${
                              item.isAvailable
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                                : "bg-rose-600 hover:bg-rose-500 text-white"
                            }`}
                          >
                            {isToggling ? (
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : item.isAvailable ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Available</span>
                              </>
                            ) : (
                              <>
                                <Ban className="w-3.5 h-3.5" />
                                <span>86 (Sold Out)</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HotelRoomServiceStaffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <RoomServiceStaffWorkspaceContent />
    </Suspense>
  );
}
