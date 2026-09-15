import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { User } from "../../domain/user.aggregate";
import type { UserRepositoryPort } from "../../domain/ports/user-repository.port";
import type { Role } from "../../domain/role";
import type { UsersTable } from "./user.schema";

@Injectable()
export class KyselyUserRepository implements UserRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(user: User): Promise<void> {
    const row = this.toRow(user);
    await this.db
      .insertInto("users")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
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
        })
      )
      .execute();
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.selectFrom("users").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", email.trim().toLowerCase())
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyUserId(legacyUserId: number): Promise<User | null> {
    const row = await this.db
      .selectFrom("users")
      .selectAll()
      .where("legacy_user_id", "=", legacyUserId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const row = await this.db
      .selectFrom("users")
      .select("id")
      .where("email", "=", email.trim().toLowerCase())
      .executeTakeFirst();
    return !!row;
  }

  async list(filter?: { branchId?: string | null }): Promise<User[]> {
    let query = this.db.selectFrom("users").selectAll();
    if (filter?.branchId !== undefined) {
      query =
        filter.branchId === null
          ? query.where("branch_id", "is", null)
          : query.where("branch_id", "=", filter.branchId);
    }
    const rows = await query.orderBy("created_at").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(user: User) {
    return {
      id: user.id,
      branch_id: user.branchId,
      name: user.name,
      email: user.email,
      password_hash: user.passwordHash,
      role: user.role,
      permission_grants: JSON.stringify(user.permissionGrants),
      permission_revokes: JSON.stringify(user.permissionRevokes),
      pin_hash: user.pinHash,
      is_active: user.isActive,
      legacy_user_id: user.legacyUserId,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  }

  private toDomain(row: Selectable<UsersTable>): User {
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
