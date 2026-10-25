import type { INestApplicationContext, Type } from "@nestjs/common";
import type { Database } from "../../../src/shared/database/database.token";
import type { Customer } from "../../../src/contexts/customers/domain/customer.aggregate";
import type { SimulatedClock } from "./clock";

export interface MenuItemRef {
  id: string;
  categoryKey: string;
  popularity: number;
  variants: { id: string; label: string }[];
  modifiers: { id: string; name: string }[];
}

export interface CustomerRef {
  customer: Customer;
  phone: string;
  name: string;
  branchKey: string;
  addressId: string;
  addressText: string;
}

export interface SeedContext {
  app: INestApplicationContext;
  db: Database;
  clock: SimulatedClock;
  rand: () => number;
  users: Record<string, string>;
  branches: Record<string, string>;
  treasuries: Record<string, string>;
  bankTreasuryId: string;
  accounts: Record<string, string>;
  inventory: Record<string, string>;
  suppliers: Record<string, string>;
  menuItems: Record<string, MenuItemRef>;
  variants: Record<string, string>;
  combos: Record<string, string>;
  paymentMethods: Record<string, { id: string; kind: string }>;
  drivers: Record<string, string[]>;
  employees: Record<string, string>;
  customers: CustomerRef[];
  expenseCategories: Record<string, string>;
  rewards: string[];
  stats: Record<string, number>;
}

export function handler<T>(ctx: SeedContext, type: Type<T>): T {
  return ctx.app.get(type, { strict: false });
}

export function count(ctx: SeedContext, key: string, by = 1): void {
  ctx.stats[key] = (ctx.stats[key] ?? 0) + by;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

export function between(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

export function weighted<T>(rand: () => number, items: readonly T[], weightOf: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = rand() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
