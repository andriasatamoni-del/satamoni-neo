export interface CartLineAddon {
  variantId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CartLine {
  key: string;
  kind: "item" | "combo";
  refId: string;
  name: string;
  variantLabel: string | null;
  addons: CartLineAddon[];
  unitPrice: number;
  quantity: number;
}

export interface RecentOrder {
  id: string;
  token: string;
  total: number;
  createdAt: string;
}

const CART_KEY = "satamoni-neo:storefront-cart-v2";
const RECENT_KEY = "satamoni-neo:storefront-recent-orders";
const BRANCH_KEY = "satamoni-neo:storefront-branch";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export const loadCart = () => read<CartLine[]>(CART_KEY, []);
export const saveCart = (lines: CartLine[]) => write(CART_KEY, lines);
export const loadRecentOrders = () => read<RecentOrder[]>(RECENT_KEY, []);
export function rememberOrder(order: RecentOrder): void {
  write(RECENT_KEY, [order, ...loadRecentOrders().filter((o) => o.id !== order.id)].slice(0, 10));
}

export const loadLastBranch = () => read<string | null>(BRANCH_KEY, null);
export const rememberBranch = (branchId: string) => write(BRANCH_KEY, branchId);

export function newRequestId(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
