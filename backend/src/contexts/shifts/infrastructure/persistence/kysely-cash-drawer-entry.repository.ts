import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { CashDrawerEntry, type CashDrawerEntryType } from "../../domain/cash-drawer-entry.aggregate";
import type { CashDrawerEntryRepositoryPort } from "../../domain/ports/cash-drawer-entry-repository.port";
import type { CashDrawerEntriesTable } from "./cash-drawer-entry.schema";

@Injectable()
export class KyselyCashDrawerEntryRepository implements CashDrawerEntryRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(entry: CashDrawerEntry): Promise<void> {
    await this.db
      .insertInto("cash_drawer_entries")
      .values({
        id: entry.id,
        shift_id: entry.shiftId,
        branch_id: entry.branchId,
        user_id: entry.userId,
        entry_type: entry.entryType,
        amount: entry.amount,
        label: entry.label,
        notes: entry.notes,
        created_by: entry.createdBy,
        created_at: entry.createdAt,
      })
      .execute();
  }

  async listByShift(shiftId: string): Promise<CashDrawerEntry[]> {
    const rows = await this.db
      .selectFrom("cash_drawer_entries")
      .selectAll()
      .where("shift_id", "=", shiftId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: Selectable<CashDrawerEntriesTable>): CashDrawerEntry {
    return CashDrawerEntry.reconstitute(row.id, {
      shiftId: row.shift_id,
      branchId: row.branch_id,
      userId: row.user_id,
      entryType: row.entry_type as CashDrawerEntryType,
      amount: Number(row.amount),
      label: row.label,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
    });
  }
}
