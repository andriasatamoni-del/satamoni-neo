const TOKEN_STORAGE_KEY = "satamoni-neo:token";

// محليًا: فاضي عمدًا - "/api/..." بترجع لـproxy فايت (vite.config.ts) اللي بيوجّهها للباك إند.
// الإنتاج: لو الفرونت والباك إند اتنشروا كـservices منفصلة (Render static site + web service مثلًا)،
// VITE_API_BASE_URL بيتحدد وقت البناء برابط الباك إند الفعلي (راجع DEPLOYMENT.md) - الباك إند مفعّل
// عليه CORS بالفعل (main.ts) فمفيش داعي لـrewrite/proxy في الإنتاج
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = getToken();
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
    throw new ApiError(Array.isArray(message) ? message.join(", ") : message, res.status);
  }

  if (res.status === 204) return undefined as T;
  // NestJS بيرجّع body فاضي (Content-Length: 0) مع status 200 لما الـcontroller يرجّع null صراحة -
  // مش "null" كنص زي ما Express العادي كان هيعمل. res.json() بيرمي SyntaxError على body فاضي، وده
  // كان بيسيب أي استعلام React Query عالق في إعادة المحاولة (isLoading فاضل true) بدل ما يتحل بـnull
  const text = await res.text();
  return text ? JSON.parse(text) : (null as T);
}
