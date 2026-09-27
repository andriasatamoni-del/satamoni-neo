import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";

export type MenuPriceHistoryEntityType = "variant" | "modifier" | "modifier_variant_price";

export interface MenuPriceHistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  variantId: string | null;
  fieldName: string;
  oldPrice: number | null;
  newPrice: number | null;
  changedBy: string | null;
  changedByName: string | null;
  createdAt: string;
}

// سجل تغييرات أسعار المنيو - append-only، نفس فلسفة EmployeeHistoryService بالظبط (وnفس منطق
// db/menu-price-history.js بالريبو القديم بالحرف): سطر واحد بس لما السعر فعليًا يتغيّر (لو نفس القيمة
// القديمة، أو الاتنين null، مفيش سطر يتسجّل خالص).
@Injectable()
export class MenuPriceHistoryService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async recordChange(input: {
    entityType: MenuPriceHistoryEntityType;
    entityId: string;
    variantId?: string | null;
    fieldName: string;
    oldPrice: number | string | null;
    newPrice: number | string | null;
    changedBy: string | null;
  }): Promise<void> {
    const oldPrice = input.oldPrice == null ? null : Number(input.oldPrice);
    const newPrice = input.newPrice == null ? null : Number(input.newPrice);
    if (oldPrice === null && newPrice === null) return;
    if (oldPrice === newPrice) return;

    await this.db
      .insertInto("menu_price_history")
      .values({
        entity_type: input.entityType,
        entity_id: input.entityId,
        variant_id: input.variantId ?? null,
        field_name: input.fieldName,
        old_price: oldPrice,
        new_price: newPrice,
        changed_by: input.changedBy,
      })
      .execute();
  }

  async listByVariant(variantId: string): Promise<MenuPriceHistoryEntry[]> {
    const rows = await this.db
      .selectFrom("menu_price_history")
      .leftJoin("users", "users.id", "menu_price_history.changed_by")
      .select([
        "menu_price_history.id as id",
        "menu_price_history.entity_type as entity_type",
        "menu_price_history.entity_id as entity_id",
        "menu_price_history.variant_id as variant_id",
        "menu_price_history.field_name as field_name",
        "menu_price_history.old_price as old_price",
        "menu_price_history.new_price as new_price",
        "menu_price_history.changed_by as changed_by",
        "users.name as changed_by_name",
        "menu_price_history.created_at as created_at",
      ])
      .where("menu_price_history.entity_type", "=", "variant")
      .where("menu_price_history.entity_id", "=", variantId)
      .orderBy("menu_price_history.created_at", "desc")
      .execute();

    return rows.map(toEntry);
  }

  async listByModifier(modifierId: string, variantId?: string | null): Promise<MenuPriceHistoryEntry[]> {
    let query = this.db
      .selectFrom("menu_price_history")
      .leftJoin("users", "users.id", "menu_price_history.changed_by")
      .select([
        "menu_price_history.id as id",
        "menu_price_history.entity_type as entity_type",
        "menu_price_history.entity_id as entity_id",
        "menu_price_history.variant_id as variant_id",
        "menu_price_history.field_name as field_name",
        "menu_price_history.old_price as old_price",
        "menu_price_history.new_price as new_price",
        "menu_price_history.changed_by as changed_by",
        "users.name as changed_by_name",
        "menu_price_history.created_at as created_at",
      ])
      .where("menu_price_history.entity_id", "=", modifierId);

    query = variantId
      ? query.where("menu_price_history.entity_type", "=", "modifier_variant_price").where("menu_price_history.variant_id", "=", variantId)
      : query.where("menu_price_history.entity_type", "=", "modifier");

    const rows = await query.orderBy("menu_price_history.created_at", "desc").execute();
    return rows.map(toEntry);
  }
}

function toEntry(r: {
  id: string;
  entity_type: string;
  entity_id: string;
  variant_id: string | null;
  field_name: string;
  old_price: number | null;
  new_price: number | null;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: Date;
}): MenuPriceHistoryEntry {
  return {
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    variantId: r.variant_id,
    fieldName: r.field_name,
    oldPrice: r.old_price == null ? null : Number(r.old_price),
    newPrice: r.new_price == null ? null : Number(r.new_price),
    changedBy: r.changed_by,
    changedByName: r.changed_by_name,
    createdAt: r.created_at.toISOString(),
  };
}
