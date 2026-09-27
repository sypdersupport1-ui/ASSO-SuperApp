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
