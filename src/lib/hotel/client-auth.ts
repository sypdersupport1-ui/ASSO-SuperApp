/**
 * Client-Side Hotel Staff Authentication Helper
 * 
 * Manages Bearer tokens for staff browser requests to Hotel API endpoints.
 * In local development and preview, it attempts to acquire a staff demo token
 * if no active session token exists. In production, demo-token endpoint is disabled,
 * and standard session credentials from sessionStorage or cookies are utilized.
 */

let cachedToken: string | null = null;

export async function getStaffAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") {
    return {};
  }

  if (!cachedToken) {
    try {
      cachedToken = sessionStorage.getItem("asso_staff_token");
    } catch {
      // Ignore storage errors in restrictive environments
    }
  }

  if (!cachedToken) {
    try {
      const res = await fetch("/api/v1/auth/demo-token");
      const json = await res.json();
      if (json.success && json.data?.token) {
        cachedToken = json.data.token;
        try {
          sessionStorage.setItem("asso_staff_token", cachedToken!);
        } catch {
          // Ignore storage errors
        }
      }
    } catch {
      // Fallback if network fails
    }
  }

  return cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {};
}

export async function hotelFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const authHeaders = await getStaffAuthHeaders();
  const headers = {
    ...authHeaders,
    ...(init?.headers || {}),
  };
  return fetch(input, { ...init, headers });
}
