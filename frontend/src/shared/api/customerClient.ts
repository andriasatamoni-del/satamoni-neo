const CUSTOMER_TOKEN_STORAGE_KEY = "satamoni-neo:customer-token";

// عميل API منفصل تمامًا عن shared/api/client.ts (بوابة الموظفين) - توكن العميل بسر مختلف تمامًا
// (راجع CustomersModule) فمينفعش نخلطه مع localStorage بتاع توكن الموظف حتى بالغلط
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export function getCustomerToken(): string | null {
  return localStorage.getItem(CUSTOMER_TOKEN_STORAGE_KEY);
}

export function setCustomerToken(token: string | null): void {
  if (token) localStorage.setItem(CUSTOMER_TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(CUSTOMER_TOKEN_STORAGE_KEY);
}

export class CustomerApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "CustomerApiError";
  }
}

export async function customerApiRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getCustomerToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const message = payload?.message ?? `فشل الطلب (${res.status})`;
    throw new CustomerApiError(Array.isArray(message) ? message.join(", ") : message, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? JSON.parse(text) : (null as T);
}
