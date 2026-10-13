import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, isNull, or } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Treasury, type TreasuryKind } from "../../domain/treasury.aggregate";
import type { TreasuryRepositoryPort } from "../../domain/ports/treasury-repository.port";
import { treasuries } from "./treasury.tables";

@Injectable()
export class TreasuryRepository implements TreasuryRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(treasury: Treasury): Promise<void> {
    await this.db
      .insert(treasuries)
      .values({
        id: treasury.id,
        name: treasury.name,
        kind: treasury.kind,
        branch_id: treasury.branchId,
        account_id: treasury.accountId,
        created_at: treasury.createdAt,
      })
      .onConflictDoNothing({ target: treasuries.id });
  }

  async findById(id: string): Promise<Treasury | null> {
    const [row] = await this.db.select().from(treasuries).where(eq(treasuries.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string }): Promise<Treasury[]> {
    const rows = await this.db
      .select()
      .from(treasuries)
      .where(filter?.branchId ? or(eq(treasuries.branch_id, filter.branchId), isNull(treasuries.branch_id)) : undefined)
      .orderBy(asc(treasuries.name));
    // خزينة رئيسية الأول ثم البنوك - نفس ترتيب الريبو القديم بالظبط
    rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "MAIN" ? -1 : 1));
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: typeof treasuries.$inferSelect): Treasury {
    return Treasury.reconstitute(row.id, {
      name: row.name,
      kind: row.kind as TreasuryKind,
      branchId: row.branch_id,
      accountId: row.account_id,
      createdAt: row.created_at,
    });
  }
}
