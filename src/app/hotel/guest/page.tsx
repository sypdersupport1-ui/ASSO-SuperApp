"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Sparkles,
  Wrench,
  HelpCircle,
  Package,
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
  Smartphone,
  Plus,
  UtensilsCrossed,
  Receipt,
  Wifi,
  Phone,
  Calendar,
  User,
  CreditCard,
  ArrowRight,
  Coffee,
  Check,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

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

interface ServiceRequestItem {
  requestId: string;
  requestType: string;
  category: string;
  priority: "NORMAL" | "URGENT";
  displayStatus: "Submitted" | "In Progress" | "Resolved" | "Completed" | "Cancelled";
  rawStatus: string;
  title: string;
  description: string;
  roomNumber: string;
  createdAt: string;
  resolvedAt?: string | null;
}

interface CustomerOrderItem {
  orderId: string;
  orderNumber: string;
  roomNumber: string;
  status: string;
  displayStatus: "Received" | "Preparing" | "Ready" | "On the way" | "Delivered" | "Cancelled";
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  createdAt: string;
  items: Array<{
    orderItemId: string;
    itemName: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
    specialNotes?: string | null;
  }>;
}


const SERVICE_CATEGORIES = [
  {
    type: "HOUSEKEEPING" as const,
    title: "Housekeeping",
    subtitle: "Room cleaning, fresh linens & tidy up",
    icon: Sparkles,
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    presets: [
      "Fresh towels and linens",
      "Full room cleaning refresh",
      "Trash removal & tidy up",
      "Extra pillows & blanket",
    ],
  },
  {
    type: "AMENITY" as const,
    title: "Amenities & Toiletries",
    subtitle: "Extra shampoo, dental kit, slippers, water",
    icon: Package,
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    presets: [
      "Extra bath towels",
      "Toiletries & soap kit",
      "Dental & shaving kit",
      "Complimentary water bottles",
      "Bedroom slippers",
    ],
  },
  {
    type: "MAINTENANCE" as const,
    title: "Maintenance & Repairs",
    subtitle: "AC cooling, plumbing, lights, TV assistance",
    icon: Wrench,
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    presets: [
      "Air conditioning temperature issue",
      "Bathroom plumbing or water drainage",
      "Light bulb or power outlet",
      "TV or Wi-Fi troubleshooting",
      "Safe box lock assistance",
    ],
  },
  {
    type: "GUEST_ASSISTANCE" as const,
    title: "Concierge & Assistance",
    subtitle: "Luggage help, wake-up call, transport",
    icon: HelpCircle,
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    presets: [
      "Luggage assistance / bell desk",
      "Late check-out inquiry",
      "Wake-up call request",
      "Local transport & taxi assistance",
      "In-room dining cutlery / glasses",
    ],
  },
];

function HotelGuestPortalContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token");

  // Core Session State
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [context, setContext] = useState<CustomerContext | null>(null);
  const [stay, setStay] = useState<StayContext | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<"NOT_FOUND" | "REVOKED" | "EXPIRED" | "GENERAL" | null>(null);

  // Active Destination Tab
  const [activeTab, setActiveTab] = useState<"home" | "stay" | "services" | "activity" | "charges">("home");
  const [activitySubTab, setActivitySubTab] = useState<"requests" | "orders">("requests");

  // Data Collections
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [orders, setOrders] = useState<CustomerOrderItem[]>([]);

  // Request Submission Modal
  const [selectedCategory, setSelectedCategory] = useState<typeof SERVICE_CATEGORIES[0] | null>(null);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDesc, setRequestDesc] = useState("");
  const [priority, setPriority] = useState<"NORMAL" | "URGENT">("NORMAL");
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

  // Guest Preferences Modal
  const [identifyModalOpen, setIdentifyModalOpen] = useState(false);
  const [custName, setCustName] = useState("");
  const [identifiedName, setIdentifiedName] = useState<string | null>(null);

  // 1. Resolve QR Token or validate cached session
  const initializeSession = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setErrorType(null);

    try {
      let tokenToResolve = tokenFromUrl;

      // Check sessionStorage if not in URL
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
            if (json.data.stay?.guestFirstName) {
              setIdentifiedName(json.data.stay.guestFirstName);
            } else {
              const pref = sessionStorage.getItem("asso_guest_preferred_name");
              if (pref) setIdentifiedName(pref);
            }
            setLoading(false);
            return;
          }
        }
      }

      if (!tokenToResolve) {
        setErrorType("NOT_FOUND");
        setErrorMessage("Please scan a valid Hotel Room QR code to access your digital concierge.");
        setLoading(false);
        return;
      }

      // Resolve opaque QR token server-side
      const res = await fetch(`/api/v1/customer/qr/${encodeURIComponent(tokenToResolve)}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        if (json.error?.code === "BUSINESS_RULE_VIOLATION" || json.error?.details?.code === "QR_REVOKED") {
          setErrorType("REVOKED");
          setErrorMessage(json.error?.message || "This room QR code has been revoked or replaced.");
        } else {
          setErrorType("NOT_FOUND");
          setErrorMessage(json.error?.message || "Invalid or unrecognized hotel QR code.");
        }
        setLoading(false);
        return;
      }

      const resolution = json.data;
      setSessionToken(resolution.sessionToken);
      setContext(resolution.context);
      setStay(resolution.stay);
      if (resolution.stay?.guestFirstName) {
        setIdentifiedName(resolution.stay.guestFirstName);
      } else {
        const pref = sessionStorage.getItem("asso_guest_preferred_name");
        if (pref) setIdentifiedName(pref);
      }
      sessionStorage.setItem("asso_guest_session_token", resolution.sessionToken);
    } catch {
      setErrorType("GENERAL");
      setErrorMessage("Unable to connect to hotel services. Please verify your connection.");
    } finally {
      setLoading(false);
    }
  }, [tokenFromUrl]);

  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // 2. Fetch Customer Service Requests
  const fetchRequests = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await fetch("/api/v1/customer/service-requests", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRequests(json.data);
      }
    } catch {
      // background fetch silent error
    }
  }, [sessionToken]);

  // 3. Fetch Customer Room Service Orders
  const fetchOrders = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await fetch("/api/v1/customer/room-service/orders", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setOrders(json.data);
      }
    } catch {
      // background fetch silent error
    }
  }, [sessionToken]);

  // Trigger data fetches on session ready
  useEffect(() => {
    if (sessionToken) {
      fetchRequests();
      fetchOrders();
    }
  }, [sessionToken, fetchRequests, fetchOrders]);

  // 4. Connect Realtime SSE Stream for Room-Scoped Updates
  useEffect(() => {
    if (!sessionToken) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/v1/customer/realtime?auth=${encodeURIComponent(sessionToken)}`);

      const handleRequestChange = () => {
        fetchRequests();
      };

      const handleOrderChange = () => {
        fetchOrders();
      };

      eventSource.addEventListener("service_request.created", handleRequestChange);
      eventSource.addEventListener("service_request.updated", handleRequestChange);
      eventSource.addEventListener("service_request.completed", handleRequestChange);

      eventSource.addEventListener("order.created", handleOrderChange);
      eventSource.addEventListener("order.accepted", handleOrderChange);
      eventSource.addEventListener("order.preparing", handleOrderChange);
      eventSource.addEventListener("order.ready", handleOrderChange);
      eventSource.addEventListener("order.out_for_delivery", handleOrderChange);
      eventSource.addEventListener("order.delivered", handleOrderChange);
      eventSource.addEventListener("order.cancelled", handleOrderChange);
    } catch {
      // Realtime fallback
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [sessionToken, fetchRequests, fetchOrders]);

  // 6. Submit Service Request
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !selectedCategory) return;
    if (!requestTitle.trim() || !requestDesc.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/customer/service-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          requestType: selectedCategory.type,
          title: requestTitle.trim(),
          description: requestDesc.trim(),
          priority,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setFormSuccess(true);
        toast.success("Your request has been received by our hotel team!");
        await fetchRequests();
        setTimeout(() => {
          setSelectedCategory(null);
          setRequestTitle("");
          setRequestDesc("");
          setPriority("NORMAL");
          setFormSuccess(false);
          setActiveTab("activity");
          setActivitySubTab("requests");
        }, 1200);
      } else {
        toast.error(json.error?.message || "Failed to submit request.");
      }
    } catch {
      toast.error("Network error. Please try submitting again.");
    } finally {
      setSubmitting(false);
    }
  };

  // 7. Handle Customer Identification (Name + Phone)
  // 6. Handle Guest Preferred Display Name (Client Session Preference)
  const handleIdentify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      toast.error("Please enter your preferred display name.");
      return;
    }

    const preferred = custName.trim();
    setIdentifiedName(preferred);
    sessionStorage.setItem("asso_guest_preferred_name", preferred);
    setIdentifyModalOpen(false);
    toast.success(`Welcome, ${preferred}! Preferred name set for this session.`);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center space-y-4 max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center animate-pulse">
            <Sparkles className="w-8 h-8 text-indigo-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white tracking-tight">ASSO Digital Concierge</h1>
            <p className="text-sm text-slate-400">Connecting to your room context...</p>
          </div>
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mt-2" />
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
            <h1 className="text-2xl font-bold text-white">
              {errorType === "REVOKED" ? "QR Code Expired" : "Room QR Not Found"}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">{errorMessage}</p>
          </div>
          <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 text-xs text-slate-400 text-left space-y-2">
            <div className="flex items-center space-x-2 text-slate-300 font-medium">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Need Immediate Assistance?</span>
            </div>
            <p>
              Please dial 0 from your in-room telephone or visit the Front Desk at the lobby for assistance.
            </p>
          </div>
          <button
            onClick={initializeSession}
            className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl transition shadow-lg shadow-indigo-600/25 flex items-center justify-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Connection</span>
          </button>
        </div>
      </main>
    );
  }

  const displayName = identifiedName || stay?.guestFirstName || "Valued Guest";
  const activeRequestsCount = requests.filter(
    (r) => r.displayStatus === "Submitted" || r.displayStatus === "In Progress"
  ).length;
  const activeOrdersCount = orders.filter(
    (o) => o.status !== "DELIVERED" && o.status !== "CANCELLED"
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28 selection:bg-indigo-500 selection:text-white flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                {context.hotelName}
              </div>
              <div className="text-sm font-bold text-white leading-tight">
                {context.propertyName}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIdentifyModalOpen(true)}
              className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-200 transition"
              title="Guest Profile"
            >
              <User className="w-3.5 h-3.5 text-indigo-400" />
              <span className="max-w-[100px] truncate">{displayName}</span>
            </button>
            <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full shadow-inner">
              <Home className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-bold text-white">Room {context.roomNumber}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-xl mx-auto px-4 pt-4 space-y-5 flex-1 w-full">
        {/* ==================================================================== */}
        {/* TAB 1: CONCIERGE / HOME                                              */}
        {/* ==================================================================== */}
        {activeTab === "home" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Hero Welcome Card */}
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950/80 via-slate-900/90 to-slate-950 border border-indigo-500/20 p-6 backdrop-blur-xl shadow-2xl space-y-3">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-xs font-medium text-indigo-300">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Verified In-Room Experience</span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Welcome, {displayName}
              </h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                Enjoy your stay in Room {context.roomNumber}. Request housekeeping, order gourmet in-room dining, or review your stay charges anytime.
              </p>
            </section>

            {/* In-Flight Activity Banner (if any active requests or dining orders) */}
            {(activeRequestsCount > 0 || activeOrdersCount > 0) && (
              <div
                onClick={() => setActiveTab("activity")}
                className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between cursor-pointer hover:bg-amber-500/15 transition group shadow-sm"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-pulse">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-300">
                      Active Requests & Orders
                    </div>
                    <div className="text-[11px] text-slate-300">
                      {activeRequestsCount > 0 && `${activeRequestsCount} service request being handled`}
                      {activeRequestsCount > 0 && activeOrdersCount > 0 && " • "}
                      {activeOrdersCount > 0 && `${activeOrdersCount} in-room dining order in preparation`}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            )}

            {/* Quick Action Concierge Grid */}
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Concierge Services
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {/* 1. In-Room Dining */}
                <Link
                  href="/hotel/guest/room-service"
                  className="bg-slate-900/90 hover:bg-slate-800/90 border border-amber-500/30 p-4 rounded-2xl transition flex flex-col justify-between space-y-3 group shadow-md"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                    <UtensilsCrossed className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                      In-Room Dining
                    </div>
                    <div className="text-[11px] text-slate-400">Order meals to your room</div>
                  </div>
                </Link>

                {/* 2. Service Request */}
                <button
                  onClick={() => setActiveTab("services")}
                  className="text-left bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition flex flex-col justify-between space-y-3 group shadow-md"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                      Request a Service
                    </div>
                    <div className="text-[11px] text-slate-400">Linens, housekeeping, AC</div>
                  </div>
                </button>

                {/* 3. My Stay Details */}
                <button
                  onClick={() => setActiveTab("stay")}
                  className="text-left bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition flex flex-col justify-between space-y-3 group shadow-md"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                    <Home className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                      My Stay & Wi-Fi
                    </div>
                    <div className="text-[11px] text-slate-400">Room info & amenities</div>
                  </div>
                </button>

                {/* 4. My Bill / Charges */}
                <button
                  onClick={() => {
                    setActiveTab("charges");
                  }}
                  className="text-left bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition flex flex-col justify-between space-y-3 group shadow-md"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                      Stay Charges
                    </div>
                    <div className="text-[11px] text-slate-400">View room balance</div>
                  </div>
                </button>
              </div>
            </section>

            {/* In-Room Wi-Fi & Support Card */}
            <section className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-md">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2.5 text-white font-bold text-sm">
                  <Wifi className="w-4 h-4 text-emerald-400" />
                  <span>Complimentary Room Wi-Fi</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Complimentary
                </span>
              </div>
              <div className="text-xs text-slate-300 space-y-1.5 leading-relaxed">
                <p>
                  High-speed wireless internet access is available throughout the hotel property.
                </p>
                <p className="text-slate-400 text-[11px]">
                  Network connection details and access credentials are provided on your keycard wallet or available at the Front Desk.
                </p>
              </div>
            </section>

            {/* Hotel Telephone Directory */}
            <section className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-md">
              <div className="flex items-center space-x-2 text-white font-bold text-sm pb-2 border-b border-slate-800">
                <Phone className="w-4 h-4 text-indigo-400" />
                <span>In-Room Telephone & Support</span>
              </div>
              <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                <p>
                  For direct voice assistance, use the dedicated speed-dial buttons on your in-room telephone handset (Front Desk, Housekeeping, Dining).
                </p>
                <p className="text-slate-400 text-[11px]">
                  You can also submit instant service requests and dining orders directly through this digital concierge.
                </p>
              </div>
            </section>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: MY STAY DETAILS                                               */}
        {/* ==================================================================== */}
        {activeTab === "stay" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Home className="w-4 h-4 text-emerald-400" />
                My Stay Information
              </h2>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                In Residence
              </span>
            </div>

            {/* Room & Stay Summary Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-800">
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-400 font-medium">Room Assigned</div>
                  <div className="text-xl font-black text-white">Room {context.roomNumber}</div>
                  {context.floor && (
                    <div className="text-xs text-slate-400">Floor {context.floor}</div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-400 font-medium">Registered Guest</div>
                  <div className="text-sm font-bold text-white truncate">{displayName}</div>
                  <div className="text-xs text-indigo-400">Verified Session</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Check-in Date</span>
                  </div>
                  <div className="font-medium text-slate-200">
                    {stay?.checkInDate
                      ? new Date(stay.checkInDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Today"}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>Expected Check-out</span>
                  </div>
                  <div className="font-medium text-slate-200">
                    {stay?.checkOutDate
                      ? new Date(stay.checkOutDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Confirmed with Front Desk"}
                  </div>
                </div>
              </div>
            </div>

            {/* Hotel Services & Operational Guidance */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-3 text-xs">
              <h3 className="font-bold text-white text-sm pb-2 border-b border-slate-800">
                Hotel Amenities & Services
              </h3>
              <div className="space-y-2 text-slate-300 leading-relaxed">
                <p>
                  In-room dining and guest service requests can be submitted 24/7 directly through this digital portal.
                </p>
                <p className="text-slate-400 text-[11px]">
                  Operational hours for dining venues, wellness facilities, and housekeeping schedules are managed property-wide. Please check with the Front Desk for current facility timings and special requests.
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("services")}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Request Service</span>
              </button>
              <Link
                href="/hotel/guest/room-service"
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/20"
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>Order Dining</span>
              </Link>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: SERVICES LIST                                                 */}
        {/* ==================================================================== */}
        {activeTab === "services" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between px-1">
              <div>
                <h2 className="text-base font-bold text-white">Guest Services & Amenities</h2>
                <p className="text-xs text-slate-400">Choose a service to submit an instant request.</p>
              </div>
            </div>

            {/* In-Room Dining Featured Card */}
            <Link
              href="/hotel/guest/room-service"
              className="w-full text-left bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-slate-900 border border-amber-500/30 hover:border-amber-500/50 p-4.5 rounded-3xl transition-all duration-200 flex items-center justify-between group shadow-xl relative overflow-hidden"
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-amber-500/20 border border-amber-500/30 text-amber-400 group-hover:scale-105 transition-transform">
                  <UtensilsCrossed className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                    <span>24/7 Available</span>
                  </div>
                  <div className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                    In-Room Dining Menu
                  </div>
                  <div className="text-xs text-slate-400">
                    Fresh breakfasts, mains, desserts, and drinks delivered to your door.
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-amber-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </Link>

            {/* Core Service Categories */}
            <div className="grid grid-cols-1 gap-3">
              {SERVICE_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.type}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setRequestTitle("");
                      setRequestDesc("");
                      setPriority("NORMAL");
                    }}
                    className="w-full text-left bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition-all duration-200 flex items-center justify-between group shadow-md"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${cat.color} group-hover:scale-105 transition-transform`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">
                          {cat.title}
                        </div>
                        <div className="text-xs text-slate-400">{cat.subtitle}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: MY REQUESTS & ORDERS (ACTIVITY)                               */}
        {/* ==================================================================== */}
        {activeTab === "activity" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Subtab Segmented Control */}
            <div className="flex rounded-2xl bg-slate-900 p-1 border border-slate-800">
              <button
                onClick={() => setActivitySubTab("requests")}
                className={`flex-1 py-2 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-1.5 ${
                  activitySubTab === "requests"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Service Requests ({requests.length})</span>
              </button>
              <button
                onClick={() => setActivitySubTab("orders")}
                className={`flex-1 py-2 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-1.5 ${
                  activitySubTab === "orders"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>Dining Orders ({orders.length})</span>
              </button>
            </div>

            {/* Sub-view: Service Requests */}
            {activitySubTab === "requests" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-slate-400 font-medium">Recent Service Requests</span>
                  <button
                    onClick={fetchRequests}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                {requests.length === 0 ? (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-bold text-slate-200">No service requests yet</div>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      Need fresh towels, extra amenities, or maintenance? Tap below to choose a service.
                    </p>
                    <button
                      onClick={() => setActiveTab("services")}
                      className="mt-2 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition inline-flex items-center space-x-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Request a Service</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map((req) => {
                      const isComplete = req.displayStatus === "Completed" || req.displayStatus === "Resolved";
                      const isInProgress = req.displayStatus === "In Progress";
                      return (
                        <article
                          key={req.requestId}
                          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-md"
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                                  {req.requestType}
                                </span>
                                {req.priority === "URGENT" && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-bold">
                                    URGENT
                                  </span>
                                )}
                              </div>
                              <h3 className="text-sm font-bold text-white leading-snug">{req.title}</h3>
                            </div>
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                isComplete
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : isInProgress
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              }`}
                            >
                              {req.displayStatus}
                            </span>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60">
                            {req.description}
                          </p>

                          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                            <span>
                              Submitted at{" "}
                              {new Date(req.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {req.resolvedAt && (
                              <span className="text-emerald-400 font-medium">
                                Resolved at{" "}
                                {new Date(req.resolvedAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Sub-view: Dining Orders */}
            {activitySubTab === "orders" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-slate-400 font-medium">In-Room Dining Orders</span>
                  <button
                    onClick={fetchOrders}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                {orders.length === 0 ? (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                      <UtensilsCrossed className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-bold text-slate-200">No dining orders placed yet</div>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      Explore our all-day in-room dining menu for breakfast, mains, desserts, and refreshments.
                    </p>
                    <Link
                      href="/hotel/guest/room-service"
                      className="mt-2 py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition inline-flex items-center space-x-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Browse Menu</span>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.map((ord) => {
                      const isDelivered = ord.displayStatus === "Delivered";
                      const isCancelled = ord.displayStatus === "Cancelled";
                      return (
                        <article
                          key={ord.orderId}
                          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="text-xs font-mono font-bold text-amber-400">
                                Order #{ord.orderNumber}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Delivering to Room {ord.roomNumber} •{" "}
                                {new Date(ord.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                isDelivered
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : isCancelled
                                  ? "bg-slate-800 text-slate-400 border-slate-700"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              }`}
                            >
                              {ord.displayStatus}
                            </span>
                          </div>

                          {/* Line items list */}
                          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 space-y-1.5">
                            {ord.items.map((it) => (
                              <div key={it.orderItemId} className="flex justify-between text-xs text-slate-200">
                                <span>
                                  {it.quantity}x {it.itemName}
                                </span>
                                <span className="font-mono text-slate-400">₹{it.subtotal}</span>
                              </div>
                            ))}
                            <div className="pt-2 border-t border-slate-800 flex justify-between text-xs font-bold text-white">
                              <span>Total Amount</span>
                              <span className="font-mono text-amber-400">₹{ord.totalAmount}</span>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 5: MY CHARGES / FOLIO BILL                                       */}
        {/* ==================================================================== */}
        {/* ==================================================================== */}
        {/* TAB 5: MY CHARGES / ROOM ACCOUNT                                     */}
        {/* ==================================================================== */}
        {activeTab === "charges" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between px-1">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-purple-400" />
                  Stay Charges & Account
                </h2>
                <p className="text-xs text-slate-400">Room account summary and placed charges</p>
              </div>
              <button
                onClick={fetchOrders}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center space-x-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            {/* Room Account Summary Banner */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-purple-500/20 rounded-3xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-[10px] font-mono text-purple-400 uppercase tracking-wider font-semibold">
                    Room Billing Account
                  </div>
                  <div className="text-sm font-bold text-white">Room {context.roomNumber} ({context.propertyName})</div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {stay?.hasActiveStay ? "Active Stay" : "In Residence"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <div className="text-slate-400">Registered Guest</div>
                  <div className="font-bold text-white truncate">{displayName}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-slate-400">Dining Charges Placed</div>
                  <div className="font-mono font-bold text-amber-400">
                    {orders.length} order{orders.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            </div>

            {/* Honest Operational Notice Regarding Digital Folio Statements */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-md">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <Receipt className="w-4 h-4 text-indigo-400" />
                <span>In-Room Folio Statement Notice</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Direct in-room digital folio review is currently pending integration with the customer billing engine. All room charges, nightly tariffs, and applicable taxes are consolidated on your master folio at Front Desk.
              </p>
              <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-[11px] text-slate-400">
                For a complete printed or digital itemized billing statement, or to settle account balances, please contact or visit the Front Desk.
              </div>
            </div>

            {/* In-Room Dining Charges Placed in Session */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Room Dining Charges ({orders.length})
              </h3>

              {orders.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No dining charges posted during this session.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {orders.map((ord) => (
                    <div key={ord.orderId} className="py-3 flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            DINING #{ord.orderNumber}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(ord.createdAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <span className="text-[10px] text-indigo-300 font-mono">
                            {ord.displayStatus}
                          </span>
                        </div>
                        <div className="text-xs text-white">
                          {ord.items.map((it) => `${it.quantity}x ${it.itemName}`).join(", ")}
                        </div>
                      </div>

                      <div className="font-mono font-bold text-xs shrink-0 text-amber-400">
                        ₹{ord.totalAmount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* BOTTOM MOBILE NAVIGATION BAR                                         */}
      {/* ==================================================================== */}
      <nav
        aria-label="Guest portal bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/80 px-2 py-2"
      >
        <div className="max-w-xl mx-auto flex items-center justify-around">
          {/* 1. Home */}
          <button
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
              activeTab === "home" ? "text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] mt-1">Concierge</span>
          </button>

          {/* 2. My Stay */}
          <button
            onClick={() => setActiveTab("stay")}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
              activeTab === "stay" ? "text-emerald-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[10px] mt-1">My Stay</span>
          </button>

          {/* 3. Services */}
          <button
            onClick={() => setActiveTab("services")}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
              activeTab === "services" ? "text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-[10px] mt-1">Services</span>
          </button>

          {/* 4. Dining */}
          <Link
            href="/hotel/guest/room-service"
            className="flex flex-col items-center py-1 px-2.5 rounded-xl text-slate-400 hover:text-amber-400 transition"
          >
            <UtensilsCrossed className="w-5 h-5" />
            <span className="text-[10px] mt-1">Dining</span>
          </Link>

          {/* 5. Activity (Requests & Orders) */}
          <button
            onClick={() => setActiveTab("activity")}
            className={`relative flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
              activeTab === "activity" ? "text-amber-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-[10px] mt-1">Activity</span>
            {(activeRequestsCount > 0 || activeOrdersCount > 0) && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          {/* 6. Charges */}
          <button
            onClick={() => setActiveTab("charges")}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
              activeTab === "charges" ? "text-purple-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span className="text-[10px] mt-1">My Bill</span>
          </button>
        </div>
      </nav>

      {/* ==================================================================== */}
      {/* MODAL: SERVICE REQUEST CREATION                                      */}
      {/* ==================================================================== */}
      {selectedCategory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in slide-in-from-bottom duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${selectedCategory.color}`}>
                  <selectedCategory.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedCategory.title}</h3>
                  <div className="text-xs text-slate-400">Room {context.roomNumber} Service Request</div>
                </div>
              </div>
              <button
                onClick={() => setSelectedCategory(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formSuccess ? (
              <div className="py-10 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-bold text-white">Request Dispatched</h4>
                <p className="text-xs text-slate-300">
                  Our hotel team has received your request for Room {context.roomNumber} and will assist you shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitRequest} className="space-y-4">
                {/* Quick Presets */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Quick Suggestions
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedCategory.presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setRequestTitle(preset);
                          if (!requestDesc) setRequestDesc(`Please provide: ${preset}`);
                        }}
                        className={`text-xs px-3 py-1.5 rounded-xl border transition ${
                          requestTitle === preset
                            ? "bg-indigo-600 text-white border-indigo-500 font-semibold"
                            : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Request Title */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Request Subject</label>
                  <input
                    type="text"
                    required
                    value={requestTitle}
                    onChange={(e) => setRequestTitle(e.target.value)}
                    placeholder="e.g. Extra Bath Towels"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none text-white text-sm"
                  />
                </div>

                {/* Request Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Special Instructions / Quantity</label>
                  <textarea
                    required
                    rows={3}
                    value={requestDesc}
                    onChange={(e) => setRequestDesc(e.target.value)}
                    placeholder="Provide any specific preferences or quantities..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none text-white text-sm resize-none"
                  />
                </div>

                {/* Priority Selection */}
                <div className="flex items-center justify-between bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white">Priority Level</div>
                    <div className="text-[11px] text-slate-400">Mark urgent for immediate assistance</div>
                  </div>
                  <div className="flex space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPriority("NORMAL")}
                      className={`text-xs px-3 py-1 rounded-md font-bold transition ${
                        priority === "NORMAL" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriority("URGENT")}
                      className={`text-xs px-3 py-1 rounded-md font-bold transition ${
                        priority === "URGENT"
                          ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Urgent
                    </button>
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !requestTitle.trim() || !requestDesc.trim()}
                    className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit Request</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: GUEST IDENTIFICATION (NAME + PHONE POPUP)                      */}
      {/* ==================================================================== */}
      {identifyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <User className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Guest Preferences</h3>
              </div>
              <button
                onClick={() => setIdentifyModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Official guest registration is maintained at the Front Desk. You may set a preferred greeting name for this in-room digital concierge session below.
            </p>

            <form onSubmit={handleIdentify} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Preferred Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alice"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none text-white text-sm"
                />
              </div>

              <div className="pt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIdentifyModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-md shadow-indigo-600/30 flex items-center justify-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Preference</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HotelGuestPortalPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <HotelGuestPortalContent />
    </Suspense>
  );
}
