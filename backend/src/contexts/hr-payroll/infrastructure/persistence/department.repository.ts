import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, ne } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Department } from "../../domain/department.aggregate";
import type { DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";
import { departments } from "./hr-payroll.tables";

@Injectable()
export class DepartmentRepository implements DepartmentRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(department: Department): Promise<void> {
    const row = this.toRow(department);
    await this.db
      .insert(departments)
      .values(row)
      .onConflictDoUpdate({ target: departments.id, set: { name: row.name, description: row.description, status: row.status } });
  }

  async findById(id: string): Promise<Department | null> {
    const [row] = await this.db.select().from(departments).where(eq(departments.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyDepartmentId(legacyId: number): Promise<Department | null> {
    const [row] = await this.db.select().from(departments).where(eq(departments.legacy_department_id, legacyId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async existsByCode(code: string, excludeId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.code, code), excludeId ? ne(departments.id, excludeId) : undefined))
      .limit(1);
    return !!row;
  }

  async existsByName(name: string, excludeId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.name, name), excludeId ? ne(departments.id, excludeId) : undefined))
      .limit(1);
    return !!row;
  }

  async list(filter?: { status?: string }): Promise<Department[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { status?: string }, page?: PageRequest): Promise<{ rows: Department[]; total: number }> {
    const where = filter?.status ? eq(departments.status, filter.status) : undefined;
    const query = this.db.select().from(departments).where(where).orderBy(asc(departments.name), desc(departments.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(departments).where(where)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
  }

  private toRow(department: Department) {
    return {
      id: department.id,
      code: department.code,
      name: department.name,
      description: department.description,
      status: department.status,
      legacy_department_id: department.legacyDepartmentId,
      created_at: department.createdAt,
    };
  }

  private toDomain(row: typeof departments.$inferSelect): Department {
    return Department.reconstitute(row.id, {
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status as "active" | "inactive",
      legacyDepartmentId: row.legacy_department_id,
      createdAt: row.created_at,
    });
  }
}
