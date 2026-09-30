import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
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
export class KyselyBotKnowledgeReader implements BotKnowledgeReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async activeMenu(): Promise<BotMenuItem[]> {
    const items = await this.db
      .selectFrom("menu_items as i")
      .leftJoin("menu_categories as c", "c.id", "i.category_id")
      .select(["i.id", "i.name", "i.is_best", "c.name as category", "c.display_order"])
      .where("i.is_active", "=", true)
      .where((eb) => eb.or([eb("c.id", "is", null), eb.and([eb("c.is_active", "=", true), eb("c.menu_group", "=", "regular")])]))
      .orderBy("c.display_order")
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
      .selectFrom("combos as c")
      .innerJoin("combo_items as ci", "ci.combo_id", "c.id")
      .innerJoin("menu_item_variants as v", "v.id", "ci.variant_id")
      .innerJoin("menu_items as i", "i.id", "v.item_id")
      .select(["c.id", "c.name", "c.price", "i.name as item_name", "v.label", "ci.quantity"])
      .where("c.is_active", "=", true)
      .where("c.online_only", "=", false)
      .orderBy("c.name")
      .execute();
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
      .selectFrom("branches")
      .select(["id", "name", "address", "phone", "hours"])
      .where("is_central_kitchen", "=", false)
      .orderBy("name")
      .execute();
  }

  async recentOrdersByPhone(phone: string, limit: number): Promise<BotRecentOrder[]> {
    const rows = await this.db
      .selectFrom("orders")
      .select(["id", "order_type", "status", "total", "created_at"])
      .where("customer_phone", "=", phone)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();
    return rows.map((r) => ({ id: r.id, orderType: r.order_type, status: r.status, total: Number(r.total), createdAt: r.created_at }));
  }

  async findActiveItemsByName(name: string): Promise<BotMenuItemMatch[]> {
    const items = await this.db
      .selectFrom("menu_items")
      .select(["id", "name"])
      .where("is_active", "=", true)
      .where((eb) => eb.or([eb(sql`lower(name)`, "=", name.toLowerCase()), eb("name", "ilike", likeContains(name))]))
      .orderBy(sql`(lower(name) = ${name.toLowerCase()})`, "desc")
      .orderBy("name")
      .limit(5)
      .execute();
    if (items.length === 0) return [];
    const exact = items.filter((i) => i.name.toLowerCase() === name.toLowerCase());
    const chosen = exact.length > 0 ? exact : items;

    const variants = await this.db
      .selectFrom("menu_item_variants")
      .select(["id", "item_id", "label", "price"])
      .where("item_id", "in", chosen.map((i) => i.id))
      .orderBy("price")
      .execute();
    return chosen.map((i) => ({
      itemId: i.id,
      name: i.name,
      variants: variants.filter((v) => v.item_id === i.id).map((v) => ({ id: v.id, label: v.label, price: Number(v.price) })),
    }));
  }

  async findActiveModifier(itemId: string, variantId: string, name: string) {
    const row = await this.db
      .selectFrom("menu_item_modifiers as m")
      .leftJoin("menu_item_modifier_variant_prices as vp", (join) =>
        join.onRef("vp.modifier_id", "=", "m.id").on("vp.variant_id", "=", variantId)
      )
      .select(["m.id", "m.name", sql<number>`COALESCE(vp.price_delta, m.price_delta)`.as("price_delta")])
      .where("m.item_id", "=", itemId)
      .where("m.is_active", "=", true)
      .where((eb) => eb.or([eb(sql`lower(m.name)`, "=", name.toLowerCase()), eb("m.name", "ilike", likeContains(name))]))
      .orderBy(sql`(lower(m.name) = ${name.toLowerCase()})`, "desc")
      .limit(1)
      .executeTakeFirst();
    return row ? { id: row.id, name: row.name, priceDelta: Number(row.price_delta) } : null;
  }
}
