import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, isNull } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { User } from "../../domain/user.aggregate";
import type { UserRepositoryPort } from "../../domain/ports/user-repository.port";
import type { Role } from "../../domain/role";
import { users } from "./identity-access.tables";

@Injectable()
export class UserRepository implements UserRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(user: User): Promise<void> {
    const row = this.toRow(user);
    await this.db
      .insert(users)
      .values(row)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          branch_id: row.branch_id,
          name: row.name,
          email: row.email,
          password_hash: row.password_hash,
          role: row.role,
          permission_grants: row.permission_grants,
          permission_revokes: row.permission_revokes,
          pin_hash: row.pin_hash,
          is_active: row.is_active,
          updated_at: row.updated_at,
        },
      });
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyUserId(legacyUserId: number): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.legacy_user_id, legacyUserId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const [row] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    return !!row;
  }

  async list(filter?: { branchId?: string | null }): Promise<User[]> {
    const branchFilter =
      filter?.branchId === undefined ? undefined : filter.branchId === null ? isNull(users.branch_id) : eq(users.branch_id, filter.branchId);
    const rows = await this.db.select().from(users).where(branchFilter).orderBy(asc(users.created_at));
    return rows.map((r) => this.toDomain(r));
  }

  // permission_grants / permission_revokes are jsonb: Drizzle serialises the arrays itself.
  private toRow(user: User): typeof users.$inferInsert & { permission_grants: string[]; permission_revokes: string[] } {
    return {
      id: user.id,
      branch_id: user.branchId,
      name: user.name,
      email: user.email,
      password_hash: user.passwordHash,
      role: user.role,
      permission_grants: [...user.permissionGrants],
      permission_revokes: [...user.permissionRevokes],
      pin_hash: user.pinHash,
      is_active: user.isActive,
      legacy_user_id: user.legacyUserId,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  }

  private toDomain(row: typeof users.$inferSelect): User {
    return User.reconstitute(row.id, {
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role as Role,
      branchId: row.branch_id,
      permissionGrants: row.permission_grants,
      permissionRevokes: row.permission_revokes,
      pinHash: row.pin_hash,
      isActive: row.is_active,
      legacyUserId: row.legacy_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
