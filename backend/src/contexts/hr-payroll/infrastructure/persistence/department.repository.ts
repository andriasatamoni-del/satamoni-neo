import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, ne } from "drizzle-orm";
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
    const rows = await this.db
      .select()
      .from(departments)
      .where(filter?.status ? eq(departments.status, filter.status) : undefined)
      .orderBy(asc(departments.name));
    return rows.map((r) => this.toDomain(r));
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
