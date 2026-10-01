"use client";

import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
  DollarSign,
  Eye,
  EyeOff,
  Flame,
  Utensils,
  Plus,
  Check,
  X,
} from "lucide-react";
import { RestaurantNav } from "@/components/restaurant/restaurant-nav";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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

interface MenuData {
  catalogId: string;
  catalogName: string;
  categories: MenuCategory[];
}

export default function RestaurantMenuAdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Price Edit Modal State
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [priceSubmitting, setPriceSubmitting] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const fetchMenu = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v1/restaurant/admin/menu");
      const json = await res.json();
      if (json.success) {
        setMenuData(json.data);
      } else {
        setError(json.error?.message || "Failed to load restaurant digital menu.");
      }
    } catch {
      setError("Network error while connecting to restaurant catalog.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      const nextStatus = !item.isAvailable;
      const res = await fetch(
        `/api/v1/restaurant/admin/menu/items/${item.itemId}/availability`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isAvailable: nextStatus }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setActionSuccess(
          `"${item.name}" marked ${nextStatus ? "IN STOCK" : "OUT OF STOCK (86'd)"}.`
        );
        setTimeout(() => setActionSuccess(null), 4000);
        // Optimistic local state update
        if (menuData) {
          setMenuData({
            ...menuData,
            categories: menuData.categories.map((cat) => ({
              ...cat,
              items: cat.items.map((i) =>
                i.itemId === item.itemId ? { ...i, isAvailable: nextStatus } : i
              ),
            })),
          });
        }
      } else {
        alert(json.error?.message || "Failed to update item availability.");
      }
    } catch {
      alert("Network error updating availability.");
    }
  };

  const handleOpenPriceModal = (item: MenuItem) => {
    setEditingItem(item);
    setNewPrice(parseFloat(item.basePrice).toFixed(2));
    setPriceError(null);
  };

  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const val = parseFloat(newPrice);
    if (isNaN(val) || val < 0) {
      setPriceError("Please enter a valid price amount.");
      return;
    }

    try {
      setPriceSubmitting(true);
      setPriceError(null);
      const res = await fetch(
        `/api/v1/restaurant/admin/menu/items/${editingItem.itemId}/price`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ basePrice: val.toFixed(4) }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setActionSuccess(`Price for "${editingItem.name}" updated to ₹${val.toFixed(2)}.`);
        setTimeout(() => setActionSuccess(null), 4000);
        // Local state update
        if (menuData) {
          setMenuData({
            ...menuData,
            categories: menuData.categories.map((cat) => ({
              ...cat,
              items: cat.items.map((i) =>
                i.itemId === editingItem.itemId
                  ? { ...i, basePrice: val.toFixed(4) }
                  : i
              ),
            })),
          });
        }
        setEditingItem(null);
      } else {
        setPriceError(json.error?.message || "Permission denied or failed to update price.");
      }
    } catch {
      setPriceError("Network error updating price.");
    } finally {
      setPriceSubmitting(false);
    }
  };

  const allItems: MenuItem[] = menuData
    ? menuData.categories.flatMap((cat) => cat.items)
    : [];

  const totalDishes = allItems.length;
  const inStockCount = allItems.filter((i) => i.isAvailable).length;
  const outOfStockCount = totalDishes - inStockCount;

  const filteredCategories = menuData
    ? menuData.categories
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
        .filter((cat) => cat.items.length > 0)
    : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <RestaurantNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-amber-600/10 text-amber-600 dark:text-amber-400">
                <BookOpen className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold font-display text-foreground">
                Digital Menu & Stock Management
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Authoritative restaurant catalog with live table QR menu synchronization
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMenu}
              disabled={loading}
              className="text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Menu
            </Button>
          </div>
        </div>

        {/* Action feedback */}
        {actionSuccess && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 rounded-lg flex items-center justify-between shadow-xs">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              {actionSuccess}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActionSuccess(null)}
              className="h-6 w-6 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Total Dishes
              </p>
              <p className="text-2xl font-bold font-display text-foreground mt-1">
                {totalDishes}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Categories
              </p>
              <p className="text-2xl font-bold font-display text-foreground mt-1">
                {menuData?.categories.length || 0}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
                In Stock & Live
              </p>
              <p className="text-2xl font-bold font-display text-emerald-600 mt-1">
                {inStockCount}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider">
                Out of Stock (86'd)
              </p>
              <p className="text-2xl font-bold font-display text-rose-600 mt-1">
                {outOfStockCount}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search dishes or ingredients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-9"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <Button
              variant={selectedCategory === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("ALL")}
              className={`text-xs h-8 ${
                selectedCategory === "ALL"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : ""
              }`}
            >
              All Categories
            </Button>
            {menuData?.categories.map((cat) => (
              <Button
                key={cat.categoryId}
                variant={selectedCategory === cat.categoryId ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat.categoryId)}
                className={`text-xs h-8 whitespace-nowrap ${
                  selectedCategory === cat.categoryId
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : ""
                }`}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && !menuData && (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-amber-600" />
            <p className="text-xs text-muted-foreground">Loading authoritative menu...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-rose-200 bg-rose-50/50 dark:bg-rose-950/20">
            <CardContent className="p-6 text-center space-y-2">
              <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
              <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                {error}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchMenu}
                className="text-xs mt-2"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Menu Categories and Items Listing */}
        <div className="space-y-8">
          {filteredCategories.map((category) => (
            <div key={category.categoryId} className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold font-display text-foreground">
                    {category.name}
                  </h2>
                  <Badge variant="outline" className="text-[10px]">
                    {category.items.length} items
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.items.map((item) => (
                  <Card
                    key={item.itemId}
                    className={`border-border transition-all ${
                      !item.isAvailable
                        ? "opacity-75 bg-slate-50/60 dark:bg-slate-900/40"
                        : "hover:shadow-xs"
                    }`}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex gap-3">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-16 w-16 rounded-lg object-cover ring-1 ring-border shrink-0"
                          />
                        ) : (
                          <div className="h-16 w-16 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                            <Utensils className="h-6 w-6" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-1">
                            <h3 className="text-xs font-bold text-foreground leading-tight truncate">
                              {item.name}
                            </h3>
                            <Badge
                              variant="outline"
                              className={`text-[9px] uppercase font-bold shrink-0 ${
                                item.isAvailable
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {item.isAvailable ? "In Stock" : "86'd"}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            {item.description || "No description provided."}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Price</p>
                          <p className="text-sm font-bold font-mono text-foreground">
                            ₹{parseFloat(item.basePrice).toFixed(2)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenPriceModal(item)}
                            className="h-7 text-[11px] px-2"
                          >
                            <DollarSign className="h-3 w-3 mr-1" />
                            Edit Price
                          </Button>

                          <Button
                            variant={item.isAvailable ? "outline" : "default"}
                            size="sm"
                            onClick={() => handleToggleAvailability(item)}
                            className={`h-7 text-[11px] px-2.5 ${
                              item.isAvailable
                                ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white"
                            }`}
                          >
                            {item.isAvailable ? "Mark 86'd" : "Restore"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Edit Price Modal Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Update Menu Price</DialogTitle>
            <DialogDescription className="text-xs">
              Modify authoritative catalog base price for:{" "}
              <strong className="text-foreground">{editingItem?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePrice} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Base Price (₹ INR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-mono">
                  ₹
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="pl-7 text-xs font-mono"
                  required
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Current catalog price: ₹
                {editingItem ? parseFloat(editingItem.basePrice).toFixed(2) : "0.00"}
              </p>
            </div>

            {priceError && (
              <p className="text-xs text-rose-600 font-medium">{priceError}</p>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingItem(null)}
                disabled={priceSubmitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={priceSubmitting}
                className="text-xs bg-amber-600 hover:bg-amber-700 text-white"
              >
                {priceSubmitting ? "Saving..." : "Save Price"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
