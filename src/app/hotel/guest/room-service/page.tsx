"use client";

import React, { useEffect, useState, useCallback, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  UtensilsCrossed,
  Sparkles,
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  Home,
  ShieldCheck,
  Building2,
  ChevronRight,
  X,
  Plus,
  Minus,
  ArrowLeft,
  Flame,
  Coffee,
  Check,
  ChefHat,
  Truck,
  Ban,
} from "lucide-react";

interface CustomerContext {
  contextId: string;
  identifier: string;
  displayLabel: string;
  roomId: string;
  roomNumber: string;
  floor?: number | null;
  propertyName: string;
  hotelName: string;
}

interface StayContext {
  hasActiveStay: boolean;
  guestFirstName?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
}

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

interface CustomerOrderDto {
  orderId: string;
  orderNumber: string;
  roomNumber: string;
  status: string;
  displayStatus: "Received" | "Preparing" | "Ready" | "On the way" | "Delivered" | "Cancelled";
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  createdAt: string;
  items: OrderLineItemDto[];
}

interface CartItem {
  item: MenuItemDto;
  quantity: number;
  specialNotes?: string;
}

function RoomServicePortalContent() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token");

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [context, setContext] = useState<CustomerContext | null>(null);
  const [stay, setStay] = useState<StayContext | null>(null);
  const [categories, setCategories] = useState<MenuCategoryDto[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [guestNotes, setGuestNotes] = useState("");
  const [ordersList, setOrdersList] = useState<CustomerOrderDto[]>([]);
  const [activeTab, setActiveTab] = useState<"menu" | "orders">("menu");

  const [loading, setLoading] = useState(true);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<CustomerOrderDto | null>(null);

  // 1. Resolve QR token or retrieve existing session
  const initializeSession = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      let tokenToResolve = tokenFromUrl;

      if (!tokenToResolve) {
        const cached = sessionStorage.getItem("asso_guest_session_token");
        if (cached) {
          const res = await fetch("/api/v1/customer/session", {
            headers: { Authorization: `Bearer ${cached}` },
          });
          const json = await res.json();
          if (json.success && json.data) {
            setSessionToken(cached);
            setContext(json.data.context);
            setStay(json.data.stay);
            setLoading(false);
            return;
          }
        }
      }

      if (!tokenToResolve) {
        setErrorMessage("Please scan a valid Room QR code to access in-room dining.");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/v1/customer/qr/${encodeURIComponent(tokenToResolve)}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        setErrorMessage(json.error?.message || "Invalid or unrecognized hotel QR code.");
        setLoading(false);
        return;
      }

      const resolution = json.data;
      setSessionToken(resolution.sessionToken);
      setContext(resolution.context);
      setStay(resolution.stay);
      sessionStorage.setItem("asso_guest_session_token", resolution.sessionToken);
    } catch {
      setErrorMessage("Unable to connect to hotel service. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [tokenFromUrl]);

  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // 2. Fetch Menu & Existing Orders
  const fetchMenu = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await fetch("/api/v1/customer/room-service/menu", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const json = await res.json();
      if (json.success && json.data?.categories) {
        setCategories(json.data.categories);
      }
    } catch {
      // Menu fetch fallback
    }
  }, [sessionToken]);

  const fetchOrders = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await fetch("/api/v1/customer/room-service/orders", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setOrdersList(json.data);
      }
    } catch {
      // Orders fetch fallback
    }
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken) {
      fetchMenu();
      fetchOrders();
    }
  }, [sessionToken, fetchMenu, fetchOrders]);

  // 3. Connect Realtime SSE Stream for Room-Scoped Order Updates
  useEffect(() => {
    if (!sessionToken) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/v1/customer/realtime?auth=${encodeURIComponent(sessionToken)}`);

      const handleOrderUpdate = () => {
        fetchOrders();
      };

      eventSource.addEventListener("order.created", handleOrderUpdate);
      eventSource.addEventListener("order.accepted", handleOrderUpdate);
      eventSource.addEventListener("order.preparing", handleOrderUpdate);
      eventSource.addEventListener("order.ready", handleOrderUpdate);
      eventSource.addEventListener("order.out_for_delivery", handleOrderUpdate);
      eventSource.addEventListener("order.delivered", handleOrderUpdate);
      eventSource.addEventListener("order.cancelled", handleOrderUpdate);
    } catch {
      // Realtime fallback
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [sessionToken, fetchOrders]);

  // Cart operations
  const addToCart = (item: MenuItemDto) => {
    if (!item.isAvailable) return;
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.itemId);
      if (existing) {
        next.set(item.itemId, { ...existing, quantity: existing.quantity + 1 });
      } else {
        next.set(item.itemId, { item, quantity: 1 });
      }
      return next;
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (existing) {
        if (existing.quantity > 1) {
          next.set(itemId, { ...existing, quantity: existing.quantity - 1 });
        } else {
          next.delete(itemId);
        }
      }
      return next;
    });
  };

  const cartTotalItems = Array.from(cart.values()).reduce((sum, c) => sum + c.quantity, 0);
  const cartSubtotal = Array.from(cart.values()).reduce(
    (sum, c) => sum + parseFloat(c.item.basePrice) * c.quantity,
    0
  );
  const cartTax = cartSubtotal * 0.05;
  const cartTotal = cartSubtotal + cartTax;

  // Submit Room Service Order
  const handlePlaceOrder = async () => {
    if (!sessionToken || cart.size === 0) return;
    if (!stay?.hasActiveStay) {
      alert("In-room dining requires an active hotel stay check-in. Please contact the front desk.");
      return;
    }

    setSubmittingOrder(true);
    try {
      const itemsPayload = Array.from(cart.values()).map((c) => ({
        itemId: c.item.itemId,
        quantity: c.quantity,
        specialNotes: c.specialNotes || undefined,
      }));

      const res = await fetch("/api/v1/customer/room-service/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
          "Idempotency-Key": `order_${context?.roomId}_${Date.now()}`,
        },
        body: JSON.stringify({
          items: itemsPayload,
          guestNotes: guestNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setCart(new Map());
        setIsCartOpen(false);
        setGuestNotes("");
        setOrderSuccess(json.data);
        await fetchOrders();
        setActiveTab("orders");
      } else {
        alert(json.error?.message || "Failed to place order. Please try again.");
      }
    } catch {
      alert("Network error while submitting order. Please verify and retry.");
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Cancel order handler
  const handleCancelOrder = async (orderId: string) => {
    if (!sessionToken) return;
    if (!confirm("Are you sure you want to cancel this order?")) return;

    try {
      const res = await fetch(`/api/v1/customer/room-service/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ reason: "Guest cancelled via mobile portal" }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchOrders();
      } else {
        alert(json.error?.message || "Order cannot be cancelled at this stage.");
      }
    } catch {
      alert("Failed to cancel order.");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center space-y-4 max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center animate-pulse">
            <UtensilsCrossed className="w-8 h-8 text-amber-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Room Service & Dining</h1>
            <p className="text-sm text-slate-400">Loading gourmet menu...</p>
          </div>
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mt-2" />
        </div>
      </main>
    );
  }

  if (errorMessage || !context) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">In-Room Dining Access</h1>
            <p className="text-sm text-slate-300 leading-relaxed">{errorMessage}</p>
          </div>
          <Link
            href="/hotel/guest"
            className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl transition shadow-lg shadow-indigo-600/25 flex items-center justify-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Guest Home</span>
          </Link>
        </div>
      </main>
    );
  }

  const filteredCategories =
    selectedCategory === "ALL"
      ? categories
      : categories.filter((c) => c.categoryId === selectedCategory);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-32 selection:bg-amber-500 selection:text-white">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3.5">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/hotel/guest"
              className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition"
              title="Back to Guest Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                In-Room Dining • 24/7
              </div>
              <div className="text-base font-bold text-white leading-tight">
                {context.propertyName}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full shadow-inner">
            <Home className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-white">Room {context.roomNumber}</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto px-4 pt-4 space-y-5">
        {/* Active Stay Alert Banner if not verified */}
        {!stay?.hasActiveStay && (
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200 leading-relaxed">
              <span className="font-bold">Check-in required:</span> Room service ordering is reserved for verified in-house guests. Please complete front desk check-in before placing orders.
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <nav aria-label="Room service view" className="flex rounded-2xl bg-slate-900 p-1 border border-slate-800">
          <button
            onClick={() => setActiveTab("menu")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 ${
              activeTab === "menu"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>F&B Menu</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("orders");
              fetchOrders();
            }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 ${
              activeTab === "orders"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>My Orders</span>
            {ordersList.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
                {ordersList.length}
              </span>
            )}
          </button>
        </nav>

        {/* TAB 1: Menu View */}
        {activeTab === "menu" && (
          <div className="space-y-4">
            {/* Category Filter Pills */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedCategory("ALL")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
                  selectedCategory === "ALL"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                }`}
              >
                All Menu
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.categoryId}
                  onClick={() => setSelectedCategory(cat.categoryId)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
                    selectedCategory === cat.categoryId
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Menu Items List */}
            <div className="space-y-6">
              {filteredCategories.map((category) => (
                <section key={category.categoryId} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-300">
                      {category.name}
                    </h2>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {category.items.length} items
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {category.items.map((item) => {
                      const inCart = cart.get(item.itemId);
                      return (
                        <article
                          key={item.itemId}
                          className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between space-y-3 ${
                            !item.isAvailable
                              ? "bg-slate-900/40 border-slate-800/60 opacity-60"
                              : "bg-slate-900/90 hover:bg-slate-900 border-slate-800 hover:border-slate-700 shadow-md"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <h3 className="text-sm font-bold text-white">{item.name}</h3>
                                {!item.isAvailable && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-bold">
                                    Sold Out (86)
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  {item.description}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-sm font-extrabold text-amber-400">
                                ₹{parseFloat(item.basePrice).toFixed(2)}
                              </span>
                              <div className="text-[10px] text-slate-500">+5% GST</div>
                            </div>
                          </div>

                          {/* Action Controls */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                            <span className="text-[11px] font-medium text-slate-500">
                              {item.fulfillmentStation === "BAR" ? "🍹 Beverages" : "🍳 Kitchen Fresh"}
                            </span>

                            {item.isAvailable ? (
                              inCart ? (
                                <div className="flex items-center space-x-2 bg-slate-950 border border-amber-500/30 rounded-xl px-2 py-1">
                                  <button
                                    onClick={() => removeFromCart(item.itemId)}
                                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition active:scale-95"
                                    aria-label="Decrease quantity"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="text-xs font-bold text-amber-300 w-5 text-center">
                                    {inCart.quantity}
                                  </span>
                                  <button
                                    onClick={() => addToCart(item)}
                                    className="w-7 h-7 rounded-lg bg-amber-600 hover:bg-amber-500 flex items-center justify-center text-white transition active:scale-95"
                                    aria-label="Increase quantity"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => addToCart(item)}
                                  className="py-1.5 px-3.5 rounded-xl bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white text-xs font-bold border border-amber-500/30 transition shadow-sm inline-flex items-center space-x-1.5 active:scale-95"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Add to Cart</span>
                                </button>
                              )
                            ) : (
                              <span className="text-xs text-slate-500 font-medium italic">
                                Currently Unavailable
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: Orders Tracking View */}
        {activeTab === "orders" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Room {context.roomNumber} Orders
              </h2>
              <button
                onClick={fetchOrders}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center space-x-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            {ordersList.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                  <UtensilsCrossed className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-slate-200">No room service orders placed yet</div>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Browse our gourmet in-room dining menu and treat yourself to fresh delights delivered right to your door.
                </p>
                <button
                  onClick={() => setActiveTab("menu")}
                  className="mt-2 py-2 px-4 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-bold border border-amber-500/30 transition inline-flex items-center space-x-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Browse Menu</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {ordersList.map((ord) => {
                  const isDelivered = ord.status === "DELIVERED";
                  const isCancelled = ord.status === "CANCELLED";
                  const canCancel = ord.status === "PLACED";

                  return (
                    <article
                      key={ord.orderId}
                      className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl"
                    >
                      {/* Order Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs font-mono font-bold text-amber-400">
                            {ord.orderNumber}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Placed at {new Date(ord.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>

                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold border ${
                            isDelivered
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : isCancelled
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : ord.status === "READY" || ord.status === "OUT_FOR_DELIVERY"
                              ? "bg-sky-500/10 text-sky-400 border-sky-500/20 animate-pulse"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {ord.displayStatus}
                        </span>
                      </div>

                      {/* Progress Stepper for Active Orders */}
                      {!isCancelled && (
                        <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                            <span className={ord.status !== "CANCELLED" ? "text-amber-400" : ""}>Received</span>
                            <span className={["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(ord.status) ? "text-amber-400" : ""}>Preparing</span>
                            <span className={["READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(ord.status) ? "text-amber-400" : ""}>Ready</span>
                            <span className={["OUT_FOR_DELIVERY", "DELIVERED"].includes(ord.status) ? "text-sky-400" : ""}>On the Way</span>
                            <span className={isDelivered ? "text-emerald-400" : ""}>Delivered</span>
                          </div>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                            <div
                              className={`h-full transition-all duration-500 ${
                                isDelivered
                                  ? "w-full bg-emerald-500"
                                  : ord.status === "OUT_FOR_DELIVERY"
                                  ? "w-4/5 bg-sky-500"
                                  : ord.status === "READY"
                                  ? "w-3/5 bg-amber-500"
                                  : ord.status === "PREPARING" || ord.status === "ACCEPTED"
                                  ? "w-2/5 bg-amber-500"
                                  : "w-1/5 bg-amber-500"
                              }`}
                            />
                          </div>
                        </div>
                      )}

                      {/* Items List */}
                      <div className="space-y-1.5 divide-y divide-slate-800/60">
                        {ord.items.map((line) => (
                          <div key={line.orderItemId} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-amber-300">{line.quantity}x</span>
                              <span className="text-white font-medium">{line.itemName}</span>
                            </div>
                            <span className="text-slate-300 font-mono">₹{line.subtotal}</span>
                          </div>
                        ))}
                      </div>

                      {/* Total & Cancel Action */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Amount</div>
                          <div className="text-sm font-extrabold text-white font-mono">₹{ord.totalAmount}</div>
                        </div>

                        {canCancel && (
                          <button
                            onClick={() => handleCancelOrder(ord.orderId)}
                            className="text-xs px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition flex items-center space-x-1"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Cancel Order</span>
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar (When Cart Has Items) */}
      {cartTotalItems > 0 && !isCartOpen && (
        <aside aria-label="Order checkout bar" className="fixed bottom-4 inset-x-4 max-w-xl mx-auto z-40 animate-in slide-in-from-bottom duration-300">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black rounded-2xl p-4 shadow-2xl flex items-center justify-between transition active:scale-[0.99]"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-slate-950/20 flex items-center justify-center font-extrabold text-sm">
                {cartTotalItems}
              </div>
              <div className="text-left">
                <div className="text-xs uppercase tracking-wider text-slate-950/80 font-bold">Review Cart</div>
                <div className="text-base font-black">₹{cartTotal.toFixed(2)}</div>
              </div>
            </div>

            <div className="flex items-center space-x-1 text-xs uppercase font-extrabold tracking-wider">
              <span>Checkout</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        </aside>
      )}

      {/* Slide-Up Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in slide-in-from-bottom duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Your Room Service Cart</h3>
                  <div className="text-xs text-slate-400">Room {context.roomNumber} Delivery</div>
                </div>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="space-y-3 divide-y divide-slate-800">
              {Array.from(cart.values()).map(({ item, quantity }) => (
                <div key={item.itemId} className="pt-3 first:pt-0 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-white">{item.name}</div>
                    <div className="text-xs text-amber-400 font-mono">
                      ₹{parseFloat(item.basePrice).toFixed(2)} each
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
                    <button
                      onClick={() => removeFromCart(item.itemId)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold text-amber-300 w-5 text-center">
                      {quantity}
                    </span>
                    <button
                      onClick={() => addToCart(item)}
                      className="w-7 h-7 rounded-lg bg-amber-600 hover:bg-amber-500 flex items-center justify-center text-white transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Guest Special Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Special Requests / Dietary Preferences
              </label>
              <textarea
                rows={2}
                value={guestNotes}
                onChange={(e) => setGuestNotes(e.target.value)}
                placeholder="e.g. Less spicy, extra cutlery, ice water on side..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:outline-none text-white text-sm resize-none"
              />
            </div>

            {/* Price Breakdown */}
            <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Items Subtotal</span>
                <span className="text-white font-mono">₹{cartSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>GST (5%)</span>
                <span className="text-white font-mono">₹{cartTax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                <span>Total Amount</span>
                <span className="text-amber-400 font-mono">₹{cartTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex space-x-3">
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                Add More Items
              </button>
              <button
                type="button"
                disabled={submittingOrder || cart.size === 0}
                onClick={handlePlaceOrder}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-600/30 flex items-center justify-center space-x-2"
              >
                {submittingOrder ? (
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Place Order</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HotelRoomServiceGuestPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <RoomServicePortalContent />
    </Suspense>
  );
}
