import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { menuPriceHistory } from "../../infrastructure/persistence/catalog.tables";

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

const ENTRY_COLUMNS = {
  id: menuPriceHistory.id,
  entity_type: menuPriceHistory.entity_type,
  entity_id: menuPriceHistory.entity_id,
  variant_id: menuPriceHistory.variant_id,
  field_name: menuPriceHistory.field_name,
  old_price: menuPriceHistory.old_price,
  new_price: menuPriceHistory.new_price,
  changed_by: menuPriceHistory.changed_by,
  changed_by_name: users.name,
  created_at: menuPriceHistory.created_at,
};

// سجل تغييرات أسعار المنيو - append-only، نفس فلسفة EmployeeHistoryService بالظبط (وnفس منطق
// db/menu-price-history.js بالريبو القديم بالحرف): سطر واحد بس لما السعر فعليًا يتغيّر (لو نفس القيمة
// القديمة، أو الاتنين null، مفيش سطر يتسجّل خالص).
@Injectable()
export class MenuPriceHistoryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

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

    await this.db.insert(menuPriceHistory).values({
      entity_type: input.entityType,
      entity_id: input.entityId,
      variant_id: input.variantId ?? null,
      field_name: input.fieldName,
      old_price: oldPrice,
      new_price: newPrice,
      changed_by: input.changedBy,
    });
  }

  async listByVariant(variantId: string): Promise<MenuPriceHistoryEntry[]> {
    const rows = await this.db
      .select(ENTRY_COLUMNS)
      .from(menuPriceHistory)
      .leftJoin(users, eq(users.id, menuPriceHistory.changed_by))
      .where(and(eq(menuPriceHistory.entity_type, "variant"), eq(menuPriceHistory.entity_id, variantId)))
      .orderBy(desc(menuPriceHistory.created_at));

    return rows.map(toEntry);
  }

  async listByModifier(modifierId: string, variantId?: string | null): Promise<MenuPriceHistoryEntry[]> {
    const typeFilter = variantId
      ? and(eq(menuPriceHistory.entity_type, "modifier_variant_price"), eq(menuPriceHistory.variant_id, variantId))
      : eq(menuPriceHistory.entity_type, "modifier");

    const rows = await this.db
      .select(ENTRY_COLUMNS)
      .from(menuPriceHistory)
      .leftJoin(users, eq(users.id, menuPriceHistory.changed_by))
      .where(and(eq(menuPriceHistory.entity_id, modifierId), typeFilter))
      .orderBy(desc(menuPriceHistory.created_at));
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
