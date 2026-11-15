import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { auditDetail } from "../../../../shared/audit/audit-context";
import { RoleInUseError, RoleNotFoundError } from "../../domain/errors";
import type { Role } from "../../domain/role";
import { ROLE_REPOSITORY, type RoleRepositoryPort } from "../../domain/ports/role-repository.port";

@Injectable()
export class DeleteRoleHandler {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(key: Role): Promise<void> {
    await this.tx.run(async () => {
      const role = await this.roles.findByKey(key);
      if (!role) throw new RoleNotFoundError();
      role.assertDeletable();
      const users = await this.roles.userCount(key);
      if (users > 0) throw new RoleInUseError(users);
      auditDetail({ entityType: "roles", entityId: key, before: { label: role.label, scope: role.scope, permissions: [...role.permissions] } });
      await this.roles.delete(key);
    });
  }
}
