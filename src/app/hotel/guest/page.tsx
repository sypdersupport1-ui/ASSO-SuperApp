"use client";

import React, { useEffect, useState, useCallback, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

const SERVICE_CATEGORIES = [
  {
    type: "HOUSEKEEPING",
    title: "Housekeeping",
    subtitle: "Room cleaning, fresh linens & turnover",
    icon: Sparkles,
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    presets: ["Fresh towels and linens", "Full room cleaning refresh", "Trash removal & tidy up"],
  },
  {
    type: "AMENITY",
    title: "Amenities & Toiletries",
    subtitle: "Extra shampoo, dental kit, slippers",
    icon: Package,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    presets: ["Extra bath towels", "Toiletries & soap kit", "Dental & shaving kit", "Complimentary water bottles"],
  },
  {
    type: "MAINTENANCE",
    title: "Maintenance / Fix",
    subtitle: "AC, plumbing, lights, TV assistance",
    icon: Wrench,
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    presets: ["Air conditioning temperature issue", "Bathroom plumbing or drainage", "Light bulb or power outlet", "TV or Wi-Fi troubleshooting"],
  },
  {
    type: "GUEST_ASSISTANCE",
    title: "Guest Assistance",
    subtitle: "Luggage help, wake-up call, concierge",
    icon: HelpCircle,
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    presets: ["Luggage assistance / bell desk", "Late check-out inquiry", "Wake-up call request", "Local transport & taxi assistance"],
  },
];

function HotelGuestPortalContent() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token");

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [context, setContext] = useState<CustomerContext | null>(null);
  const [stay, setStay] = useState<StayContext | null>(null);
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [activeTab, setActiveTab] = useState<"services" | "requests">("services");

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<"NOT_FOUND" | "REVOKED" | "EXPIRED" | "GENERAL" | null>(null);

  // Request Modal State
  const [selectedCategory, setSelectedCategory] = useState<typeof SERVICE_CATEGORIES[0] | null>(null);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDesc, setRequestDesc] = useState("");
  const [priority, setPriority] = useState<"NORMAL" | "URGENT">("NORMAL");
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

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
          // Validate existing session
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
        setErrorType("NOT_FOUND");
        setErrorMessage("Please scan a valid Hotel Room QR code to access guest services.");
        setLoading(false);
        return;
      }

      // Resolve opaque QR token server-side
      const res = await fetch(`/api/v1/customer/qr/${encodeURIComponent(tokenToResolve)}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        if (json.error?.code === "BUSINESS_RULE_VIOLATION" || json.error?.details?.code === "QR_REVOKED") {
          setErrorType("REVOKED");
          setErrorMessage(json.error?.message || "This QR code has been revoked or replaced.");
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
      sessionStorage.setItem("asso_guest_session_token", resolution.sessionToken);
    } catch {
      setErrorType("GENERAL");
      setErrorMessage("Unable to connect to hotel service. Please check your connection and try again.");
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
      // Ignore background fetch error
    }
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken) {
      fetchRequests();
    }
  }, [sessionToken, fetchRequests]);

  // 3. Connect Realtime SSE Stream for Room-Scoped Updates
  useEffect(() => {
    if (!sessionToken) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/v1/customer/realtime?auth=${encodeURIComponent(sessionToken)}`);

      eventSource.addEventListener("service_request.created", () => {
        fetchRequests();
      });

      eventSource.addEventListener("service_request.updated", () => {
        fetchRequests();
      });

      eventSource.addEventListener("service_request.completed", () => {
        fetchRequests();
      });
    } catch {
      // SSE fallback
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [sessionToken, fetchRequests]);

  // 4. Submit Service Request
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
        await fetchRequests();
        setTimeout(() => {
          setSelectedCategory(null);
          setRequestTitle("");
          setRequestDesc("");
          setPriority("NORMAL");
          setFormSuccess(false);
          setActiveTab("requests");
        }, 1200);
      } else {
        alert(json.error?.message || "Failed to submit service request.");
      }
    } catch {
      alert("Network error. Please try submitting again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center space-y-4 max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center animate-pulse">
            <Sparkles className="w-8 h-8 text-indigo-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white tracking-tight">ASSO Guest Experience</h1>
            <p className="text-sm text-slate-400">Verifying secure room context...</p>
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
              {errorType === "REVOKED" ? "QR Code Revoked" : "QR Code Not Found"}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">{errorMessage}</p>
          </div>
          <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 text-xs text-slate-400 text-left space-y-2">
            <div className="flex items-center space-x-2 text-slate-300 font-medium">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Assistance Required?</span>
            </div>
            <p>
              Please contact the front desk or call the hotel operator from your in-room phone for an updated QR code or direct service.
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 selection:bg-indigo-500 selection:text-white">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3.5">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                {context.hotelName}
              </div>
              <div className="text-base font-bold text-white leading-tight">
                {context.propertyName}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full shadow-inner">
            <Home className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-white">Room {context.roomNumber}</span>
          </div>
        </div>
      </header>

      {/* Hero Welcome Card */}
      <main className="max-w-xl mx-auto px-4 pt-5 space-y-6">
        <section aria-labelledby="guest-welcome" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950/80 via-slate-900/90 to-slate-950 border border-indigo-500/20 p-6 backdrop-blur-xl shadow-2xl">
          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-xs font-medium text-indigo-300">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Verified Room Session</span>
            </div>
            <h1 id="guest-welcome" className="text-2xl font-black text-white tracking-tight">
              {stay?.guestFirstName ? `Welcome, ${stay.guestFirstName}` : `Welcome to Room ${context.roomNumber}`}
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              Order housekeeping, request amenities, report maintenance, or connect with our guest support team instantly.
            </p>
          </div>
        </section>

        {/* Tab Navigation */}
        <nav aria-label="Guest portal navigation" className="flex rounded-2xl bg-slate-900 p-1 border border-slate-800">
          <button
            onClick={() => setActiveTab("services")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 ${
              activeTab === "services"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Available Services</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("requests");
              fetchRequests();
            }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 ${
              activeTab === "requests"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>My Requests</span>
            {requests.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
                {requests.length}
              </span>
            )}
          </button>
        </nav>

        {/* TAB 1: Services List */}
        {activeTab === "services" && (
          <section aria-label="Available hotel service categories" className="space-y-3.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              Select a Service Category
            </h2>
            <div className="grid grid-cols-1 gap-3.5">
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
          </section>
        )}

        {/* TAB 2: My Requests List */}
        {activeTab === "requests" && (
          <section aria-label="My service requests history" className="space-y-3.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Active & Recent Requests
              </h2>
              <button
                onClick={fetchRequests}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            {requests.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                  <Clock className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-slate-200">No requests submitted yet</div>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Need fresh towels, extra amenities, or maintenance? Choose a category above to submit a request.
                </p>
                <button
                  onClick={() => setActiveTab("services")}
                  className="mt-2 py-2 px-4 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-bold border border-indigo-500/30 transition inline-flex items-center space-x-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Request</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
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
                          req.displayStatus === "Completed" || req.displayStatus === "Resolved"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : req.displayStatus === "In Progress"
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
                      <span>Submitted at {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {req.resolvedAt && (
                        <span className="text-emerald-400 font-medium">
                          Resolved at {new Date(req.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Service Request Creation Modal */}
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
                  <div className="text-xs text-slate-400">Room {context.roomNumber} Request</div>
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
                    Quick Request Suggestions
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
                  <label className="text-xs font-bold text-slate-300">Details / Special Instructions</label>
                  <textarea
                    required
                    rows={3}
                    value={requestDesc}
                    onChange={(e) => setRequestDesc(e.target.value)}
                    placeholder="Provide any specific quantities or preferences..."
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
                        <span>Dispatch Request</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
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
