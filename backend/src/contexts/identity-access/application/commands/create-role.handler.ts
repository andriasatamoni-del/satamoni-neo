import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { auditDetail } from "../../../../shared/audit/audit-context";
import { DuplicateRoleLabelError, UnknownPermissionError } from "../../domain/errors";
import { RoleDefinition } from "../../domain/role-definition.aggregate";
import type { RoleScope } from "../../domain/role";
import { ROLE_REPOSITORY, type RoleRepositoryPort } from "../../domain/ports/role-repository.port";
import { ROLE_PERMISSION_REPOSITORY, type RolePermissionRepositoryPort } from "../../domain/ports/role-permission-repository.port";

export interface CreateRoleCommand {
  label: string;
  scope: RoleScope;
  permissionKeys: string[];
}

@Injectable()
export class CreateRoleHandler {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort,
    @Inject(ROLE_PERMISSION_REPOSITORY) private readonly rolePermissions: RolePermissionRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: CreateRoleCommand): Promise<RoleDefinition> {
    return this.tx.run(async () => {
      const unknown = await this.rolePermissions.unknownKeys(command.permissionKeys);
      if (unknown.length > 0) throw new UnknownPermissionError(unknown);
      if (await this.roles.isLabelTaken(command.label)) throw new DuplicateRoleLabelError(command.label.trim());

      const role = RoleDefinition.register({
        label: command.label,
        scope: command.scope,
        permissions: command.permissionKeys,
        sortOrder: await this.roles.nextSortOrder(),
      });
      await this.roles.save(role);
      auditDetail({ entityType: "roles", entityId: role.key, after: { label: role.label, scope: role.scope, permissions: [...role.permissions] } });
      return role;
    });
  }
}
