import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import {
  comboItems,
  combos,
  menuCategories,
  menuItemModifiers,
  menuItemModifierVariantPrices,
  menuItems,
  menuItemVariants,
} from "../../../catalog/infrastructure/persistence/catalog.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";
import type {
  BotBranch,
  BotCombo,
  BotKnowledgeReaderPort,
  BotMenuItem,
  BotMenuItemMatch,
  BotRecentOrder,
} from "../../domain/ports/bot-knowledge-reader.port";

// بيهرّب % و_ و\ قبل ILIKE - عشان كلام العميل مايتفسّرش كـwildcard
function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

@Injectable()
export class BotKnowledgeReader implements BotKnowledgeReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async activeMenu(): Promise<BotMenuItem[]> {
    const items = await this.db
      .select({
        id: menuItems.id,
        name: menuItems.name,
        is_best: menuItems.is_best,
        category: menuCategories.name,
        display_order: menuCategories.display_order,
      })
      .from(menuItems)
      .leftJoin(menuCategories, eq(menuCategories.id, menuItems.category_id))
      .where(
        and(
          eq(menuItems.is_active, true),
          or(isNull(menuCategories.id), and(eq(menuCategories.is_active, true), eq(menuCategories.menu_group, "regular")))
        )
      )
      .orderBy(asc(menuCategories.display_order), asc(menuItems.name));
    if (items.length === 0) return [];

    const ids = items.map((i) => i.id);
    const [variants, modifiers] = await Promise.all([
      this.db
        .select({ id: menuItemVariants.id, item_id: menuItemVariants.item_id, label: menuItemVariants.label, price: menuItemVariants.price })
        .from(menuItemVariants)
        .where(inArray(menuItemVariants.item_id, ids))
        .orderBy(asc(menuItemVariants.price)),
      this.db
        .select({
          id: menuItemModifiers.id,
          item_id: menuItemModifiers.item_id,
          name: menuItemModifiers.name,
          price_delta: menuItemModifiers.price_delta,
        })
        .from(menuItemModifiers)
        .where(and(inArray(menuItemModifiers.item_id, ids), eq(menuItemModifiers.is_active, true)))
        .orderBy(asc(menuItemModifiers.name)),
    ]);

    return items
      .map((i) => ({
        itemId: i.id,
        name: i.name,
        category: i.category ?? "أخرى",
        isBest: i.is_best,
        variants: variants.filter((v) => v.item_id === i.id).map((v) => ({ id: v.id, label: v.label, price: Number(v.price) })),
        modifiers: modifiers.filter((m) => m.item_id === i.id).map((m) => ({ id: m.id, name: m.name, priceDelta: Number(m.price_delta) })),
      }))
      .filter((i) => i.variants.length > 0);
  }

  async activeCombos(): Promise<BotCombo[]> {
    const rows = await this.db
      .select({
        id: combos.id,
        name: combos.name,
        price: combos.price,
        item_name: menuItems.name,
        label: menuItemVariants.label,
        quantity: comboItems.quantity,
      })
      .from(combos)
      .innerJoin(comboItems, eq(comboItems.combo_id, combos.id))
      .innerJoin(menuItemVariants, eq(menuItemVariants.id, comboItems.variant_id))
      .innerJoin(menuItems, eq(menuItems.id, menuItemVariants.item_id))
      .where(and(eq(combos.is_active, true), eq(combos.online_only, false)))
      .orderBy(asc(combos.name));
    const byCombo = new Map<string, BotCombo>();
    for (const r of rows) {
      const combo = byCombo.get(r.id) ?? { name: r.name, price: Number(r.price), items: [] };
      combo.items.push({ itemName: r.item_name, variantLabel: r.label, quantity: Number(r.quantity) });
      byCombo.set(r.id, combo);
    }
    return [...byCombo.values()];
  }

  async branches(): Promise<BotBranch[]> {
    return this.db
      .select({ id: branches.id, name: branches.name, address: branches.address, phone: branches.phone, hours: branches.hours })
      .from(branches)
      .where(eq(branches.is_central_kitchen, false))
      .orderBy(asc(branches.name));
  }

  async recentOrdersByPhone(phone: string, limit: number): Promise<BotRecentOrder[]> {
    const rows = await this.db
      .select({ id: orders.id, order_type: orders.order_type, status: orders.status, total: orders.total, created_at: orders.created_at })
      .from(orders)
      .where(eq(orders.customer_phone, phone))
      .orderBy(desc(orders.created_at))
      .limit(limit);
    return rows.map((r) => ({ id: r.id, orderType: r.order_type, status: r.status, total: Number(r.total), createdAt: r.created_at }));
  }

  async findActiveItemsByName(name: string): Promise<BotMenuItemMatch[]> {
    const lowered = name.toLowerCase();
    const items = await this.db
      .select({ id: menuItems.id, name: menuItems.name })
      .from(menuItems)
      .where(and(eq(menuItems.is_active, true), or(eq(sql`lower(${menuItems.name})`, lowered), ilike(menuItems.name, likeContains(name)))))
      .orderBy(desc(sql`(lower(${menuItems.name}) = ${lowered})`), asc(menuItems.name))
      .limit(5);
    if (items.length === 0) return [];
    const exact = items.filter((i) => i.name.toLowerCase() === lowered);
    const chosen = exact.length > 0 ? exact : items;

    const variants = await this.db
      .select({ id: menuItemVariants.id, item_id: menuItemVariants.item_id, label: menuItemVariants.label, price: menuItemVariants.price })
      .from(menuItemVariants)
      .where(
        inArray(
          menuItemVariants.item_id,
          chosen.map((i) => i.id)
        )
      )
      .orderBy(asc(menuItemVariants.price));
    return chosen.map((i) => ({
      itemId: i.id,
      name: i.name,
      variants: variants.filter((v) => v.item_id === i.id).map((v) => ({ id: v.id, label: v.label, price: Number(v.price) })),
    }));
  }

  async findActiveModifier(itemId: string, variantId: string, name: string) {
    const lowered = name.toLowerCase();
    const [row] = await this.db
      .select({
        id: menuItemModifiers.id,
        name: menuItemModifiers.name,
        price_delta: sql<string>`COALESCE(${menuItemModifierVariantPrices.price_delta}, ${menuItemModifiers.price_delta})`,
      })
      .from(menuItemModifiers)
      .leftJoin(
        menuItemModifierVariantPrices,
        and(eq(menuItemModifierVariantPrices.modifier_id, menuItemModifiers.id), eq(menuItemModifierVariantPrices.variant_id, variantId))
      )
      .where(
        and(
          eq(menuItemModifiers.item_id, itemId),
          eq(menuItemModifiers.is_active, true),
          or(eq(sql`lower(${menuItemModifiers.name})`, lowered), ilike(menuItemModifiers.name, likeContains(name)))
        )
      )
      .orderBy(desc(sql`(lower(${menuItemModifiers.name}) = ${lowered})`))
      .limit(1);
    return row ? { id: row.id, name: row.name, priceDelta: Number(row.price_delta) } : null;
  }
}
