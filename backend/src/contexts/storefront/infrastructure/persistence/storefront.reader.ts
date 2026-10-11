import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
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
import { orderItemModifiers, orderItems, orderRatings, orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { paymentMethods } from "../../../payment-control/infrastructure/persistence/payment-control.tables";
import type {
  StorefrontBranch,
  StorefrontCategory,
  StorefrontCombo,
  StorefrontReaderPort,
  TrackedOrder,
} from "../../domain/ports/storefront-reader.port";

// قراءة بس (read model) - المنيو العام بيعرض الأصناف النشطة في أقسام نشطة من مجموعة "regular" (نفس فلتر
// البوت بالظبط)، وأي صنف من غير حجم بسعر بيتخفى (مايتطلبش أصلًا)
@Injectable()
export class StorefrontReader implements StorefrontReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async branches(): Promise<StorefrontBranch[]> {
    const rows = await this.db
      .select({
        id: branches.id,
        name: branches.name,
        address: branches.address,
        phone: branches.phone,
        hours: branches.hours,
        lat: branches.lat,
        lng: branches.lng,
        supports_dine_in: branches.supports_dine_in,
      })
      .from(branches)
      .where(eq(branches.is_central_kitchen, false))
      .orderBy(asc(branches.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      phone: r.phone,
      hours: r.hours,
      lat: r.lat === null ? null : Number(r.lat),
      lng: r.lng === null ? null : Number(r.lng),
      supportsDineIn: r.supports_dine_in,
    }));
  }

  async categories(): Promise<StorefrontCategory[]> {
    const items = await this.db
      .select({
        id: menuItems.id,
        name: menuItems.name,
        description: menuItems.description,
        image_url: menuItems.image_url,
        is_best: menuItems.is_best,
        category_id: menuCategories.id,
        category_name: menuCategories.name,
      })
      .from(menuItems)
      .leftJoin(menuCategories, eq(menuCategories.id, menuItems.category_id))
      .where(
        and(
          eq(menuItems.is_active, true),
          or(isNull(menuCategories.id), and(eq(menuCategories.is_active, true), eq(menuCategories.menu_group, "regular")))
        )
      )
      .orderBy(asc(menuCategories.display_order), asc(menuCategories.name), asc(menuItems.name));
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
    const overrides = modifiers.length
      ? await this.db
          .select({
            modifier_id: menuItemModifierVariantPrices.modifier_id,
            variant_id: menuItemModifierVariantPrices.variant_id,
            price_delta: menuItemModifierVariantPrices.price_delta,
          })
          .from(menuItemModifierVariantPrices)
          .where(
            inArray(
              menuItemModifierVariantPrices.modifier_id,
              modifiers.map((m) => m.id)
            )
          )
      : [];

    const categories = new Map<string, StorefrontCategory>();
    for (const i of items) {
      const itemVariants = variants.filter((v) => v.item_id === i.id).map((v) => ({ id: v.id, label: v.label, price: Number(v.price) }));
      if (itemVariants.length === 0) continue;
      const key = i.category_id ?? "__none__";
      const category = categories.get(key) ?? { id: i.category_id, name: i.category_name ?? "أصناف تانية", items: [] };
      category.items.push({
        id: i.id,
        name: i.name,
        description: i.description,
        imageUrl: i.image_url,
        isBest: i.is_best,
        variants: itemVariants,
        modifiers: modifiers
          .filter((m) => m.item_id === i.id)
          .map((m) => ({
            id: m.id,
            name: m.name,
            prices: Object.fromEntries(
              itemVariants.map((v) => {
                const override = overrides.find((o) => o.modifier_id === m.id && o.variant_id === v.id);
                return [v.id, Number(override ? override.price_delta : m.price_delta)];
              })
            ),
          })),
      });
      categories.set(key, category);
    }
    return [...categories.values()];
  }

  async combos(): Promise<StorefrontCombo[]> {
    const rows = await this.db
      .select({
        id: combos.id,
        name: combos.name,
        price: combos.price,
        image_url: combos.image_url,
        description: combos.description,
        online_only: combos.online_only,
        item_name: menuItems.name,
        label: menuItemVariants.label,
        quantity: comboItems.quantity,
      })
      .from(combos)
      .innerJoin(comboItems, eq(comboItems.combo_id, combos.id))
      .innerJoin(menuItemVariants, eq(menuItemVariants.id, comboItems.variant_id))
      .innerJoin(menuItems, eq(menuItems.id, menuItemVariants.item_id))
      .where(eq(combos.is_active, true))
      .orderBy(desc(combos.online_only), asc(combos.name));
    const byCombo = new Map<string, StorefrontCombo>();
    for (const r of rows) {
      const combo = byCombo.get(r.id) ?? {
        id: r.id,
        name: r.name,
        price: Number(r.price),
        imageUrl: r.image_url,
        description: r.description,
        onlineOnly: r.online_only,
        items: [],
      };
      combo.items.push({ itemName: r.item_name, variantLabel: r.label, quantity: Number(r.quantity) });
      byCombo.set(r.id, combo);
    }
    return [...byCombo.values()];
  }

  async cashPaymentMethodId(): Promise<string | null> {
    const [row] = await this.db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.kind, "cash"), eq(paymentMethods.is_active, true)))
      .orderBy(asc(paymentMethods.name))
      .limit(1);
    return row?.id ?? null;
  }

  async findOrder(orderId: string): Promise<TrackedOrder | null> {
    const [row] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!row) return null;
    return (await this.hydrate([row]))[0];
  }

  async listOrdersByPhone(phone: string, limit: number): Promise<TrackedOrder[]> {
    const rows = await this.db.select().from(orders).where(eq(orders.customer_phone, phone)).orderBy(desc(orders.created_at)).limit(limit);
    return this.hydrate(rows);
  }

  private async hydrate(rows: (typeof orders.$inferSelect)[]): Promise<TrackedOrder[]> {
    if (rows.length === 0) return [];
    const orderIds = rows.map((r) => r.id);
    const branchIds = [...new Set(rows.map((r) => r.branch_id))];
    const [branchRows, lines, ratings] = await Promise.all([
      this.db.select({ id: branches.id, name: branches.name, phone: branches.phone }).from(branches).where(inArray(branches.id, branchIds)),
      this.db
        .select({
          id: orderItems.id,
          order_id: orderItems.order_id,
          quantity: orderItems.quantity,
          line_total: orderItems.line_total,
          item_name: menuItems.name,
          label: menuItemVariants.label,
          combo_name: combos.name,
        })
        .from(orderItems)
        .leftJoin(menuItems, eq(menuItems.id, orderItems.menu_item_id))
        .leftJoin(menuItemVariants, eq(menuItemVariants.id, orderItems.variant_id))
        .leftJoin(combos, eq(combos.id, orderItems.combo_id))
        .where(inArray(orderItems.order_id, orderIds)),
      this.db.select({ order_id: orderRatings.order_id }).from(orderRatings).where(inArray(orderRatings.order_id, orderIds)),
    ]);
    const modifiers = lines.length
      ? await this.db
          .select({ order_item_id: orderItemModifiers.order_item_id, name_at_sale: orderItemModifiers.name_at_sale })
          .from(orderItemModifiers)
          .where(
            inArray(
              orderItemModifiers.order_item_id,
              lines.map((l) => l.id)
            )
          )
      : [];
    const rated = new Set(ratings.map((r) => r.order_id));

    return rows.map((r) => {
      const branch = branchRows.find((b) => b.id === r.branch_id);
      return {
        id: r.id,
        trackingToken: r.rating_token,
        source: r.source,
        orderType: r.order_type,
        status: r.status,
        kitchenStatus: r.kitchen_status,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        addressDetails: r.address_details,
        tableNumber: r.table_number,
        customerNotes: r.customer_notes,
        subtotal: Number(r.subtotal),
        discount: Number(r.discount),
        total: Number(r.total),
        createdAt: r.created_at,
        kitchenAcceptedAt: r.kitchen_accepted_at,
        kitchenReadyAt: r.kitchen_ready_at,
        branch: branch ? { name: branch.name, phone: branch.phone } : null,
        lines: lines
          .filter((l) => l.order_id === r.id)
          .map((l) => ({
            name: l.combo_name ?? l.item_name ?? "صنف",
            variantLabel: l.combo_name ? null : l.label,
            quantity: Number(l.quantity),
            lineTotal: Number(l.line_total),
            modifiers: modifiers.filter((m) => m.order_item_id === l.id).map((m) => m.name_at_sale),
          })),
        rated: rated.has(r.id),
      };
    });
  }
}
