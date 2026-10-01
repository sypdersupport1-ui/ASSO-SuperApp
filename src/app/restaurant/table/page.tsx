"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  UtensilsCrossed,
  Sparkles,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Phone,
  User,
  Coffee,
  BellRing,
  Receipt,
  ShieldCheck,
  Check,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  ArrowRight,
  Info,
  X,
  ChefHat,
  ChevronRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ============================================================================
// Types
// ============================================================================

interface TableCustomerContext {
  contextId: string;
  contextType: string;
  identifier: string;
  displayLabel: string;
  tableId: string;
  tableNumber: string;
  section: string;
  capacity: number;
  propertyName: string;
  restaurantName: string;
}

interface TableCustomerResolution {
  sessionToken: string;
  sessionId: string;
  expiresAt: string;
  context: TableCustomerContext;
  table: {
    tableId: string;
    tableNumber: string;
    capacity: number;
    section: string;
    status: string;
  };
  availableServices: string[];
}

interface MenuItem {
  itemId: string;
  categoryId: string;
  name: string;
  description: string | null;
  sku: string | null;
  basePrice: string;
  taxRate: string;
  isAvailable: boolean;
  fulfillmentStation: string;
  imageUrl: string | null;
}

interface MenuCategory {
  categoryId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  items: MenuItem[];
}

interface CartItem {
  cartItemId: string;
  itemId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  specialInstructions: string | null;
  lineSubtotal: string;
  isAvailable: boolean;
}

interface CartData {
  sessionId: string;
  items: CartItem[];
  totalItems: number;
  subtotalAmount: string;
  estimatedTaxAmount: string;
  estimatedTotalAmount: string;
  isPreOrderNotice: string;
}

// ============================================================================
// Main Customer Dining Experience
// ============================================================================

function RestaurantTableContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // QR Resolution & Session State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<TableCustomerResolution | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Customer Identity State (Requirement 3: Name + Phone)
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [identifiedCustomer, setIdentifiedCustomer] = useState<{
    customerId: string;
    fullName: string;
    phone: string;
  } | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  // Digital Menu State (Requirement 6 & 7)
  const [menuLoading, setMenuLoading] = useState(false);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Item Detail Modal State (Requirement 10)
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [addingToCart, setAddingToCart] = useState(false);

  // Cart State (Requirement 11)
  const [cart, setCart] = useState<CartData | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartActionLoading, setCartActionLoading] = useState(false);

  // Assistance feedback state
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);

  // 1. Resolve QR token on mount
  useEffect(() => {
    if (!token) {
      setError("No table QR code token provided in URL. Please scan a physical table QR code.");
      setLoading(false);
      return;
    }

    const resolveQr = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/customer/qr/${encodeURIComponent(token)}`);
        const json = await res.json();
        if (json.success) {
          setResolution(json.data);
          setSessionToken(json.data.sessionToken);
        } else {
          setError(
            json.error?.message ||
              "This table QR code has been revoked or replaced. Please request a refreshed QR code from restaurant staff."
          );
        }
      } catch {
        setError("Network connection issue. Please check your internet connection and try again.");
      } finally {
        setLoading(false);
      }
    };

    resolveQr();
  }, [token]);

  // 2. Fetch Digital Menu once customer is identified
  const loadMenu = async (currentToken: string) => {
    try {
      setMenuLoading(true);
      const res = await fetch("/api/v1/restaurant/menu", {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });
      const json = await res.json();
      if (json.success) {
        setCategories(json.data.categories || []);
      }
    } catch {
      // Menu load error handled gracefully
    } finally {
      setMenuLoading(false);
    }
  };

  // 3. Fetch Cart
  const loadCart = async (currentToken: string) => {
    try {
      const res = await fetch("/api/v1/restaurant/cart", {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });
      const json = await res.json();
      if (json.success) {
        setCart(json.data);
      }
    } catch {
      // Cart fetch failure handled gracefully
    }
  };

  // 4. Handle Customer Identification (Name + Phone popup submission)
  const handleIdentifyCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      setIdentityError("Both Name and Phone number are required.");
      return;
    }

    if (!sessionToken) {
      setIdentityError("Invalid session token. Please re-scan table QR.");
      return;
    }

    try {
      setIdentifying(true);
      setIdentityError(null);
      const res = await fetch("/api/v1/restaurant/customer/identify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          fullName: customerName.trim(),
          phone: customerPhone.trim(),
        }),
      });

      const json = await res.json();
      if (json.success) {
        setIdentifiedCustomer(json.data.customer);
        const enrichedToken = json.data.sessionToken;
        setSessionToken(enrichedToken);
        // Load menu and cart with enriched token
        await Promise.all([loadMenu(enrichedToken), loadCart(enrichedToken)]);
      } else {
        setIdentityError(json.error?.message || "Failed to identify customer.");
      }
    } catch {
      setIdentityError("Network error while verifying customer profile.");
    } finally {
      setIdentifying(false);
    }
  };

  // Open item detail dialog
  const handleOpenItemDetail = (item: MenuItem) => {
    setDetailItem(item);
    setItemQuantity(1);
    setSpecialInstructions("");
  };

  // Add item to cart
  const handleAddToCart = async () => {
    if (!detailItem || !sessionToken) return;

    try {
      setAddingToCart(true);
      const res = await fetch("/api/v1/restaurant/cart/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          itemId: detailItem.itemId,
          quantity: itemQuantity,
          specialInstructions: specialInstructions.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setCart(json.data);
        setDetailItem(null);
      } else {
        alert(json.error?.message || "Failed to add item to cart.");
      }
    } catch {
      alert("Network error adding item to cart.");
    } finally {
      setAddingToCart(false);
    }
  };

  // Update item quantity in cart
  const handleUpdateCartQuantity = async (cartItemId: string, nextQty: number) => {
    if (!sessionToken) return;
    try {
      setCartActionLoading(true);
      const res = await fetch(`/api/v1/restaurant/cart/items/${cartItemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ quantity: nextQty }),
      });
      const json = await res.json();
      if (json.success) {
        setCart(json.data);
      }
    } catch {
      // Error handled
    } finally {
      setCartActionLoading(false);
    }
  };

  // Remove item from cart
  const handleRemoveCartItem = async (cartItemId: string) => {
    if (!sessionToken) return;
    try {
      setCartActionLoading(true);
      const res = await fetch(`/api/v1/restaurant/cart/items/${cartItemId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const json = await res.json();
      if (json.success) {
        setCart(json.data);
      }
    } catch {
      // Error handled
    } finally {
      setCartActionLoading(false);
    }
  };

  // Clear cart
  const handleClearCart = async () => {
    if (!sessionToken) return;
    try {
      setCartActionLoading(true);
      const res = await fetch("/api/v1/restaurant/cart", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const json = await res.json();
      if (json.success) {
        setCart(json.data);
      }
    } catch {
      // Error handled
    } finally {
      setCartActionLoading(false);
    }
  };

  // Quick table assistance
  const handleQuickRequest = (serviceName: string) => {
    setRequestFeedback(`Staff notified for "${serviceName}". Your server will attend shortly.`);
    setTimeout(() => setRequestFeedback(null), 5000);
  };

  // --------------------------------------------------------------------------
  // Loading & Error States
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-amber-600/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto ring-1 ring-amber-500/20">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Resolving Table Context...</h2>
          <p className="text-xs text-muted-foreground">Authoritative table verification in progress</p>
        </div>
      </div>
    );
  }

  if (error || !resolution) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-border shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="h-12 w-12 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">QR Code Inactive</CardTitle>
            <CardDescription className="text-xs">{error}</CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-center">
            <Link href="/">
              <Button variant="outline" size="sm" className="text-xs">
                Back to Platform
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { context, table } = resolution;

  // --------------------------------------------------------------------------
  // Step 1: Name + Phone Required Popup / Verification Modal
  // --------------------------------------------------------------------------
  if (!identifiedCustomer) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 flex flex-col items-center justify-center">
        <div className="max-w-md w-full space-y-6">
          {/* Restaurant & Table Context Header */}
          <div className="text-center space-y-2">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-700 text-white flex items-center justify-center mx-auto shadow-md ring-4 ring-amber-500/20">
              <UtensilsCrossed className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-foreground">
                {context.propertyName || context.restaurantName || "The Royal Saffron Restaurant"}
              </h1>
              <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                <span>Table {table.tableNumber}</span>
                <span>•</span>
                <span>{table.section}</span>
              </div>
            </div>
          </div>

          {/* Name + Phone Form Card */}
          <Card className="border-border shadow-md">
            <CardHeader className="pb-3 text-center">
              <CardTitle className="text-base font-bold">Start Dining Experience</CardTitle>
              <CardDescription className="text-xs">
                Please enter your Name and Mobile Phone to access the digital menu and begin your dining session.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleIdentifyCustomer} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-amber-600" />
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Rahul Sharma"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-amber-600" />
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="tel"
                    placeholder="e.g. +91 98765 43210"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="text-xs font-mono"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Required for session personalization and order tracking.
                  </p>
                </div>

                {identityError && (
                  <p className="text-xs text-rose-600 font-medium">{identityError}</p>
                )}

                <Button
                  type="submit"
                  disabled={identifying}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold h-10 shadow-sm"
                >
                  {identifying ? (
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    "View Digital Menu"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-[10px] text-muted-foreground">
            ASSO SuperApp • Verified Table QR • Privacy Protected
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Step 2: Dedicated Restaurant Customer Interface & Digital Menu
  // --------------------------------------------------------------------------

  const filteredCategories = categories
    .filter((cat) =>
      selectedCategory === "ALL" ? true : cat.categoryId === selectedCategory
    )
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => {
        const matchesSearch =
          !searchQuery.trim() ||
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.description &&
            item.description.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesSearch;
      }),
    }))
    .filter((cat) => cat.items.length > 0);

  const cartTotalItems = cart?.totalItems || 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28">
      {/* Restaurant Header */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border shadow-xs">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="h-6 w-6 rounded-md bg-amber-600 text-white flex items-center justify-center shrink-0">
                <UtensilsCrossed className="h-3.5 w-3.5" />
              </span>
              <h1 className="text-sm font-bold font-display text-foreground leading-tight truncate">
                {context.propertyName || context.restaurantName || "The Royal Saffron Restaurant"}
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                Table {table.tableNumber}
              </span>
              <span>•</span>
              <span>{table.section}</span>
              <span>•</span>
              <span className="truncate">Guest: {identifiedCustomer.fullName}</span>
            </div>
          </div>

          {/* Quick Cart Trigger */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCartOpen(true)}
            className="relative h-8 px-2.5 text-xs flex items-center gap-1.5 border-border"
          >
            <ShoppingBag className="h-4 w-4 text-amber-600" />
            <span className="font-semibold">Cart</span>
            {cartTotalItems > 0 && (
              <Badge className="h-4 min-w-4 px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold">
                {cartTotalItems}
              </Badge>
            )}
          </Button>
        </div>

        {/* Live Search & Category Pills */}
        <div className="max-w-3xl mx-auto px-4 pb-3 space-y-2.5">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search biryani, curries, appetizers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 h-8 rounded-lg bg-background"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <Button
              variant={selectedCategory === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("ALL")}
              className={`text-xs h-7 rounded-full px-3 whitespace-nowrap ${
                selectedCategory === "ALL"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "text-muted-foreground"
              }`}
            >
              All Items
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.categoryId}
                variant={selectedCategory === cat.categoryId ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat.categoryId)}
                className={`text-xs h-7 rounded-full px-3 whitespace-nowrap ${
                  selectedCategory === cat.categoryId
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "text-muted-foreground"
                }`}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-6">
        {/* Table Quick Assistance Row */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleQuickRequest("Complimentary Water")}
            className="h-10 text-[11px] font-medium flex items-center justify-center gap-1.5 rounded-lg border-border"
          >
            <Coffee className="h-3.5 w-3.5 text-amber-600" />
            Water
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleQuickRequest("Call Server / Assistance")}
            className="h-10 text-[11px] font-medium flex items-center justify-center gap-1.5 rounded-lg border-border"
          >
            <BellRing className="h-3.5 w-3.5 text-amber-600" />
            Call Server
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleQuickRequest("Request Bill")}
            className="h-10 text-[11px] font-medium flex items-center justify-center gap-1.5 rounded-lg border-border"
          >
            <Receipt className="h-3.5 w-3.5 text-amber-600" />
            Bill
          </Button>
        </div>

        {requestFeedback && (
          <Alert className="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-xs py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800 dark:text-emerald-300">
              {requestFeedback}
            </AlertDescription>
          </Alert>
        )}

        {/* Menu Loading State */}
        {menuLoading && (
          <div className="py-12 text-center space-y-2">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-amber-600" />
            <p className="text-xs text-muted-foreground">Loading gourmet digital menu...</p>
          </div>
        )}

        {/* Categories and Items Listing */}
        <div className="space-y-6">
          {filteredCategories.map((category) => (
            <section key={category.categoryId} className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-1.5">
                <h2 className="text-sm font-bold font-display text-foreground">
                  {category.name}
                </h2>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {category.items.length} dishes
                </span>
              </div>

              <div className="space-y-3">
                {category.items.map((item) => (
                  <div
                    key={item.itemId}
                    onClick={() => handleOpenItemDetail(item)}
                    className="p-3 rounded-xl bg-card border border-border flex items-center gap-3 cursor-pointer hover:border-amber-500/50 hover:shadow-xs transition-all"
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-20 w-20 rounded-lg object-cover ring-1 ring-border shrink-0"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                        <UtensilsCrossed className="h-7 w-7" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="text-xs font-bold text-foreground leading-tight">
                          {item.name}
                        </h3>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {item.description || "Freshly prepared dining specialty."}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-bold font-mono text-foreground">
                          ₹{parseFloat(item.basePrice).toFixed(2)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenItemDetail(item);
                          }}
                          className="h-7 text-[11px] px-2.5 rounded-lg border-amber-600/30 text-amber-600 hover:bg-amber-600 hover:text-white"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      {/* Floating Bottom Cart Bar */}
      {cart && cart.totalItems > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 bg-gradient-to-t from-background via-background/95 to-transparent">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setCartOpen(true)}
              className="w-full h-12 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-4 flex items-center justify-between shadow-lg ring-1 ring-amber-500/30 transition-transform active:scale-[0.99]"
            >
              <div className="flex items-center gap-2">
                <span className="h-6 min-w-6 px-1.5 rounded-full bg-white/20 text-white text-xs font-bold flex items-center justify-center">
                  {cart.totalItems}
                </span>
                <span className="text-xs font-bold">Review Pre-Order Cart</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span className="font-mono">₹{cart.subtotalAmount}</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Item Detail Modal Dialog */}
      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl">
          {detailItem?.imageUrl && (
            <div className="relative h-48 w-full bg-slate-900">
              <img
                src={detailItem.imageUrl}
                alt={detailItem.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <Badge className="bg-amber-600 text-white text-[10px] uppercase font-bold mb-1">
                  {detailItem.fulfillmentStation}
                </Badge>
                <h3 className="text-base font-bold leading-tight drop-shadow-sm">
                  {detailItem.name}
                </h3>
              </div>
            </div>
          )}

          <div className="p-4 space-y-4">
            {!detailItem?.imageUrl && (
              <div>
                <Badge className="bg-amber-600 text-white text-[10px] uppercase font-bold mb-1">
                  {detailItem?.fulfillmentStation}
                </Badge>
                <h3 className="text-base font-bold text-foreground">
                  {detailItem?.name}
                </h3>
              </div>
            )}

            <p className="text-xs text-muted-foreground leading-relaxed">
              {detailItem?.description || "Crafted freshly by our culinary team."}
            </p>

            <div className="flex items-center justify-between py-2 border-y border-border">
              <span className="text-xs text-muted-foreground font-medium">Price</span>
              <span className="text-base font-bold font-mono text-foreground">
                ₹{detailItem ? parseFloat(detailItem.basePrice).toFixed(2) : "0.00"}
              </span>
            </div>

            {/* Quantity Selector */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Quantity</span>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                  className="h-8 w-8 p-0 rounded-lg"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="text-sm font-bold font-mono w-6 text-center">
                  {itemQuantity}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setItemQuantity((q) => Math.min(50, q + 1))}
                  className="h-8 w-8 p-0 rounded-lg"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Special Instructions */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Special Instructions (Optional)
              </label>
              <Input
                placeholder="e.g. Less spicy, dressing on side"
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                className="text-xs"
                maxLength={200}
              />
            </div>

            <Button
              onClick={handleAddToCart}
              disabled={addingToCart}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold h-10 shadow-sm rounded-xl"
            >
              {addingToCart ? (
                <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                `Add to Pre-Order Cart • ₹${(
                  (detailItem ? parseFloat(detailItem.basePrice) : 0) * itemQuantity
                ).toFixed(2)}`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Pre-Order Cart Modal / Drawer */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="p-4 border-b border-border bg-card">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold">Your Pre-Order Cart</DialogTitle>
                <DialogDescription className="text-xs">
                  Table {table.tableNumber} • {identifiedCustomer.fullName}
                </DialogDescription>
              </div>
              {cart && cart.items.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearCart}
                  disabled={cartActionLoading}
                  className="text-xs text-rose-600 hover:bg-rose-50 h-7 px-2"
                >
                  Clear All
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Cart Items List */}
          <div className="p-4 overflow-y-auto space-y-3 flex-1">
            {!cart || cart.items.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <ShoppingBag className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                <p className="text-xs font-semibold text-foreground">Your cart is empty</p>
                <p className="text-[11px] text-muted-foreground">
                  Browse the menu and add dishes to start your dining order.
                </p>
              </div>
            ) : (
              cart.items.map((cItem) => (
                <div
                  key={cItem.cartItemId}
                  className="p-3 rounded-xl border border-border bg-card/60 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground truncate">{cItem.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      ₹{cItem.unitPrice} × {cItem.quantity}
                    </p>
                    {cItem.specialInstructions && (
                      <p className="text-[10px] text-amber-600 italic truncate mt-0.5">
                        "{cItem.specialInstructions}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg p-0.5">
                      <button
                        onClick={() =>
                          handleUpdateCartQuantity(cItem.cartItemId, cItem.quantity - 1)
                        }
                        disabled={cartActionLoading}
                        className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center font-bold font-mono text-[11px]">
                        {cItem.quantity}
                      </span>
                      <button
                        onClick={() =>
                          handleUpdateCartQuantity(cItem.cartItemId, cItem.quantity + 1)
                        }
                        disabled={cartActionLoading}
                        className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => handleRemoveCartItem(cItem.cartItemId)}
                      disabled={cartActionLoading}
                      className="h-7 w-7 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Pricing Preview & Slice 3 Order Boundary Notice */}
          {cart && cart.items.length > 0 && (
            <div className="p-4 border-t border-border bg-card space-y-3">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">₹{cart.subtotalAmount}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Estimated Tax (5% GST)</span>
                  <span className="font-mono">₹{cart.estimatedTaxAmount}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border">
                  <span>Estimated Total</span>
                  <span className="font-mono">₹{cart.estimatedTotalAmount}</span>
                </div>
              </div>

              {/* Strict Slice 2 Notice: Pre-order cart only, no order placement */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  Pre-Order Cart Preview (R2)
                </div>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  Your dishes are saved to this table session. Authoritative kitchen order placement and KDS synchronization will be enabled in Slice 3.
                </p>
              </div>

              <Button
                variant="outline"
                onClick={() => setCartOpen(false)}
                className="w-full text-xs h-9"
              >
                Back to Menu
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RestaurantTableCustomerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RestaurantTableContent />
    </Suspense>
  );
}
