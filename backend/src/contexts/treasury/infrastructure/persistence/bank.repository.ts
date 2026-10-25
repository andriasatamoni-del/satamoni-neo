import { Inject, Injectable } from "@nestjs/common";
import { asc, count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Bank } from "../../domain/bank.aggregate";
import type { BankRepositoryPort } from "../../domain/ports/bank-repository.port";
import { banks } from "./treasury.tables";

@Injectable()
export class BankRepository implements BankRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(bank: Bank): Promise<void> {
    await this.db
      .insert(banks)
      .values({ id: bank.id, name: bank.name, is_active: bank.isActive, created_at: bank.createdAt })
      .onConflictDoUpdate({ target: banks.id, set: { name: bank.name, is_active: bank.isActive } });
  }

  async findById(id: string): Promise<Bank | null> {
    const [row] = await this.db.select().from(banks).where(eq(banks.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<Bank[]> {
    return (await this.listPage()).rows;
  }

  async listPage(page?: PageRequest): Promise<{ rows: Bank[]; total: number }> {
    const query = this.db.select().from(banks).orderBy(asc(banks.name), desc(banks.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(banks)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
  }

  private toDomain(row: typeof banks.$inferSelect): Bank {
    return Bank.reconstitute(row.id, { name: row.name, isActive: row.is_active, createdAt: row.created_at });
  }
}
