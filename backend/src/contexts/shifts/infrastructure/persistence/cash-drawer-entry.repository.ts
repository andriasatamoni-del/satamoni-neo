import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { CashDrawerEntry, type CashDrawerEntryType } from "../../domain/cash-drawer-entry.aggregate";
import type { CashDrawerEntryRepositoryPort } from "../../domain/ports/cash-drawer-entry-repository.port";
import { cashDrawerEntries } from "./shifts.tables";

@Injectable()
export class CashDrawerEntryRepository implements CashDrawerEntryRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(entry: CashDrawerEntry): Promise<void> {
    await this.db.insert(cashDrawerEntries).values({
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
    });
  }

  async listByShift(shiftId: string): Promise<CashDrawerEntry[]> {
    const rows = await this.db
      .select()
      .from(cashDrawerEntries)
      .where(eq(cashDrawerEntries.shift_id, shiftId))
      .orderBy(desc(cashDrawerEntries.created_at));
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: typeof cashDrawerEntries.$inferSelect): CashDrawerEntry {
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
