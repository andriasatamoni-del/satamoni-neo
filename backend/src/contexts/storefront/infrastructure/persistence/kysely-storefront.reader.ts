import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { OrdersTable } from "../../../orders/infrastructure/persistence/order.schema";
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
export class KyselyStorefrontReader implements StorefrontReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async branches(): Promise<StorefrontBranch[]> {
    const rows = await this.db
      .selectFrom("branches")
      .select(["id", "name", "address", "phone", "hours", "lat", "lng", "supports_dine_in"])
      .where("is_central_kitchen", "=", false)
      .orderBy("name")
      .execute();
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
      .selectFrom("menu_items as i")
      .leftJoin("menu_categories as c", "c.id", "i.category_id")
      .select(["i.id", "i.name", "i.description", "i.image_url", "i.is_best", "c.id as category_id", "c.name as category_name"])
      .where("i.is_active", "=", true)
      .where((eb) => eb.or([eb("c.id", "is", null), eb.and([eb("c.is_active", "=", true), eb("c.menu_group", "=", "regular")])]))
      .orderBy("c.display_order")
      .orderBy("c.name")
      .orderBy("i.name")
      .execute();
    if (items.length === 0) return [];

    const ids = items.map((i) => i.id);
    const [variants, modifiers] = await Promise.all([
      this.db.selectFrom("menu_item_variants").select(["id", "item_id", "label", "price"]).where("item_id", "in", ids).orderBy("price").execute(),
      this.db
        .selectFrom("menu_item_modifiers")
        .select(["id", "item_id", "name", "price_delta"])
        .where("item_id", "in", ids)
        .where("is_active", "=", true)
        .orderBy("name")
        .execute(),
    ]);
    const overrides = modifiers.length
      ? await this.db
          .selectFrom("menu_item_modifier_variant_prices")
          .select(["modifier_id", "variant_id", "price_delta"])
          .where("modifier_id", "in", modifiers.map((m) => m.id))
          .execute()
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
      .selectFrom("combos as c")
      .innerJoin("combo_items as ci", "ci.combo_id", "c.id")
      .innerJoin("menu_item_variants as v", "v.id", "ci.variant_id")
      .innerJoin("menu_items as i", "i.id", "v.item_id")
      .select(["c.id", "c.name", "c.price", "c.image_url", "c.description", "c.online_only", "i.name as item_name", "v.label", "ci.quantity"])
      .where("c.is_active", "=", true)
      .orderBy("c.online_only", "desc")
      .orderBy("c.name")
      .execute();
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
    const row = await this.db
      .selectFrom("payment_methods")
      .select("id")
      .where("kind", "=", "cash")
      .where("is_active", "=", true)
      .orderBy("name")
      .executeTakeFirst();
    return row?.id ?? null;
  }

  async findOrder(orderId: string): Promise<TrackedOrder | null> {
    const row = await this.db.selectFrom("orders").selectAll().where("id", "=", orderId).executeTakeFirst();
    if (!row) return null;
    return (await this.hydrate([row]))[0];
  }

  async listOrdersByPhone(phone: string, limit: number): Promise<TrackedOrder[]> {
    const rows = await this.db
      .selectFrom("orders")
      .selectAll()
      .where("customer_phone", "=", phone)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();
    return this.hydrate(rows);
  }

  private async hydrate(rows: Selectable<OrdersTable>[]): Promise<TrackedOrder[]> {
    if (rows.length === 0) return [];
    const orderIds = rows.map((r) => r.id);
    const branchIds = [...new Set(rows.map((r) => r.branch_id))];
    const [branches, lines, ratings] = await Promise.all([
      this.db.selectFrom("branches").select(["id", "name", "phone"]).where("id", "in", branchIds).execute(),
      this.db
        .selectFrom("order_items as oi")
        .leftJoin("menu_items as i", "i.id", "oi.menu_item_id")
        .leftJoin("menu_item_variants as v", "v.id", "oi.variant_id")
        .leftJoin("combos as c", "c.id", "oi.combo_id")
        .select(["oi.id", "oi.order_id", "oi.quantity", "oi.line_total", "i.name as item_name", "v.label", "c.name as combo_name"])
        .where("oi.order_id", "in", orderIds)
        .execute(),
      this.db.selectFrom("order_ratings").select("order_id").where("order_id", "in", orderIds).execute(),
    ]);
    const modifiers = lines.length
      ? await this.db
          .selectFrom("order_item_modifiers")
          .select(["order_item_id", "name_at_sale"])
          .where("order_item_id", "in", lines.map((l) => l.id))
          .execute()
      : [];
    const rated = new Set(ratings.map((r) => r.order_id));

    return rows.map((r) => {
      const branch = branches.find((b) => b.id === r.branch_id);
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
