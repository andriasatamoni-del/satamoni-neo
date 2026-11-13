import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import {
  comboItems,
  combos,
  menuCategories,
  menuItems,
  menuItemVariants,
} from "../../../catalog/infrastructure/persistence/catalog.tables";
import { withAddonsFolded } from "../../../catalog/infrastructure/persistence/combo-rows";
import { orderItems, orderRatings, orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { paymentMethods } from "../../../payment-control/infrastructure/persistence/payment-control.tables";
import type {
  StorefrontAddon,
  StorefrontBranch,
  StorefrontCategory,
  StorefrontCombo,
  StorefrontReaderPort,
  TrackedOrder,
} from "../../domain/ports/storefront-reader.port";

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
          eq(menuItems.kind, "item"),
          or(isNull(menuCategories.id), and(eq(menuCategories.is_active, true), eq(menuCategories.menu_group, "regular")))
        )
      )
      .orderBy(asc(menuCategories.display_order), asc(menuCategories.name), asc(menuItems.name));
    if (items.length === 0) return [];

    const ids = items.map((i) => i.id);
    const variants = await this.db
      .select({ id: menuItemVariants.id, item_id: menuItemVariants.item_id, label: menuItemVariants.label, price: menuItemVariants.price })
      .from(menuItemVariants)
      .where(inArray(menuItemVariants.item_id, ids))
      .orderBy(asc(menuItemVariants.price));

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
      });
      categories.set(key, category);
    }
    return [...categories.values()];
  }

  async addons(): Promise<StorefrontAddon[]> {
    const rows = await this.db
      .select({ variant_id: menuItemVariants.id, name: menuItems.name, image_url: menuItems.image_url, price: menuItemVariants.price })
      .from(menuItems)
      .innerJoin(menuItemVariants, eq(menuItemVariants.item_id, menuItems.id))
      .where(and(eq(menuItems.kind, "addon"), eq(menuItems.is_active, true)))
      .orderBy(asc(menuItems.name));
    return rows.map((r) => ({ variantId: r.variant_id, name: r.name, imageUrl: r.image_url, price: Number(r.price) }));
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
        combo_item_id: comboItems.id,
        parent_combo_item_id: comboItems.parent_combo_item_id,
      })
      .from(combos)
      .innerJoin(comboItems, eq(comboItems.combo_id, combos.id))
      .innerJoin(menuItemVariants, eq(menuItemVariants.id, comboItems.variant_id))
      .innerJoin(menuItems, eq(menuItems.id, menuItemVariants.item_id))
      .where(eq(combos.is_active, true))
      .orderBy(desc(combos.online_only), asc(combos.name));
    const byCombo = new Map<string, StorefrontCombo>();
    for (const r of withAddonsFolded(rows)) {
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
          parent_order_item_id: orderItems.parent_order_item_id,
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
          .filter((l) => l.order_id === r.id && l.parent_order_item_id === null)
          .map((l) => ({
            name: l.combo_name ?? l.item_name ?? "صنف",
            variantLabel: l.combo_name ? null : l.label,
            quantity: Number(l.quantity),
            lineTotal: Number(l.line_total),
            addons: lines
              .filter((a) => a.parent_order_item_id === l.id)
              .map((a) => ({ name: a.item_name ?? "إضافة", quantity: Number(a.quantity), lineTotal: Number(a.line_total) })),
          })),
        rated: rated.has(r.id),
      };
    });
  }
}
