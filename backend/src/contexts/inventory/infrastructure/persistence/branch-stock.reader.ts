import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";
import type { BranchStockFilter, BranchStockReaderPort, BranchStockRow } from "../../domain/ports/branch-stock-reader.port";
import { branchStockBalances, inventoryItems } from "./inventory.tables";

@Injectable()
export class BranchStockReader implements BranchStockReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(filter: BranchStockFilter, page?: PageRequest): Promise<{ rows: BranchStockRow[]; total: number }> {
    const where = and(
      isNull(inventoryItems.archived_at),
      filter.itemType ? eq(inventoryItems.item_type, filter.itemType) : undefined,
      searchCondition(filter.q, inventoryItems.name)
    );
    const quantity = sql<string>`coalesce(${branchStockBalances.quantity}, 0)`;
    const query = this.db
      .select({
        inventoryItemId: inventoryItems.id,
        name: inventoryItems.name,
        unit: inventoryItems.unit,
        itemType: inventoryItems.item_type,
        quantity,
      })
      .from(inventoryItems)
      .leftJoin(
        branchStockBalances,
        and(eq(branchStockBalances.inventory_item_id, inventoryItems.id), eq(branchStockBalances.branch_id, filter.branchId))
      )
      .where(where)
      .orderBy(asc(inventoryItems.name), asc(inventoryItems.id))
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () =>
      totalOf(await this.db.select({ total: count() }).from(inventoryItems).where(where))
    );
    return { rows: rows.map((r) => ({ ...r, quantity: Number(r.quantity) })), total };
  }
}
