import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { User } from "../../domain/user.aggregate";
import type { UserListFilter, UserRepositoryPort } from "../../domain/ports/user-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { orderByOf, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";
import { ROLE, ROLES, type Role } from "../../domain/role";
import { userRoles, users } from "./identity-access.tables";

@Injectable()
export class UserRepository implements UserRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(user: User): Promise<void> {
    const row = this.toRow(user);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values(row)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            branch_id: row.branch_id,
            name: row.name,
            email: row.email,
            password_hash: row.password_hash,
            pin_hash: row.pin_hash,
            is_active: row.is_active,
            updated_at: row.updated_at,
          },
        });
      await tx.delete(userRoles).where(eq(userRoles.user_id, user.id));
      await tx.insert(userRoles).values(user.roles.map((role) => ({ user_id: user.id, role })));
    });
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? (await this.toDomain([row]))[0] : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    return row ? (await this.toDomain([row]))[0] : null;
  }

  async findByLegacyUserId(legacyUserId: number): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.legacy_user_id, legacyUserId)).limit(1);
    return row ? (await this.toDomain([row]))[0] : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const [row] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    return !!row;
  }

  async countActiveAdmins(): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.user_id, users.id))
      .where(and(eq(userRoles.role, ROLE.ADMIN), eq(users.is_active, true)));
    return Number(row?.total ?? 0);
  }

  async list(filter?: { branchId?: string | null }): Promise<User[]> {
    const branchFilter =
      filter?.branchId === undefined ? undefined : filter.branchId === null ? isNull(users.branch_id) : eq(users.branch_id, filter.branchId);
    const rows = await this.db.select().from(users).where(branchFilter).orderBy(asc(users.created_at));
    return this.toDomain(rows);
  }

  async search(filter: UserListFilter, page?: PageRequest): Promise<{ users: User[]; total: number }> {
    const where = and(
      filter.branchId === undefined ? undefined : filter.branchId === null ? isNull(users.branch_id) : eq(users.branch_id, filter.branchId),
      filter.status ? eq(users.is_active, filter.status === "active") : undefined,
      filter.role ? inArray(users.id, this.db.select({ id: userRoles.user_id }).from(userRoles).where(eq(userRoles.role, filter.role))) : undefined,
      searchCondition(filter.q, users.name, users.email)
    );
    const query = this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(...orderByOf({ createdAt: users.created_at, name: users.name, email: users.email }, filter.sort, filter.order, { key: "createdAt", order: "asc" }, users.id))
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(users).where(where)));
    return { users: await this.toDomain(rows), total };
  }

  private toRow(user: User): typeof users.$inferInsert {
    return {
      id: user.id,
      branch_id: user.branchId,
      name: user.name,
      email: user.email,
      password_hash: user.passwordHash,
      pin_hash: user.pinHash,
      is_active: user.isActive,
      legacy_user_id: user.legacyUserId,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  }

  private async toDomain(rows: (typeof users.$inferSelect)[]): Promise<User[]> {
    if (rows.length === 0) return [];
    const roleRows = await this.db
      .select({ user_id: userRoles.user_id, role: userRoles.role })
      .from(userRoles)
      .where(inArray(userRoles.user_id, rows.map((r) => r.id)));
    const rolesByUser = new Map<string, Role[]>();
    for (const r of roleRows) rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role]);

    return rows.map((row) => {
      const roles = rolesByUser.get(row.id) ?? [];
      return User.reconstitute(row.id, {
        name: row.name,
        email: row.email,
        passwordHash: row.password_hash,
        roles: ROLES.filter((r) => roles.includes(r)),
        branchId: row.branch_id,
        pinHash: row.pin_hash,
        isActive: row.is_active,
        legacyUserId: row.legacy_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    });
  }
}
