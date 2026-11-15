import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { auditDetail } from "../../../../shared/audit/audit-context";
import { RoleNotFoundError, UnknownPermissionError } from "../../domain/errors";
import type { Role } from "../../domain/role";
import { ROLE_REPOSITORY, type RoleRepositoryPort } from "../../domain/ports/role-repository.port";
import { ROLE_PERMISSION_REPOSITORY, type RolePermissionRepositoryPort } from "../../domain/ports/role-permission-repository.port";

export interface UpdateRolePermissionsCommand {
  role: string;
  permissionKeys: string[];
}

@Injectable()
export class UpdateRolePermissionsHandler {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort,
    @Inject(ROLE_PERMISSION_REPOSITORY) private readonly rolePermissions: RolePermissionRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: UpdateRolePermissionsCommand): Promise<{ role: Role; permissions: string[] }> {
    return this.tx.run(async () => {
      const role = await this.roles.findByKey(command.role);
      if (!role) throw new RoleNotFoundError();

      const unknown = await this.rolePermissions.unknownKeys(command.permissionKeys);
      if (unknown.length > 0) throw new UnknownPermissionError(unknown);

      auditDetail({ entityType: "role_permissions", entityId: role.key, before: { permissions: [...role.permissions] } });
      role.replacePermissions(command.permissionKeys);
      await this.roles.save(role);

      const after = (await this.rolePermissions.allRolePermissions())[role.key] ?? [];
      auditDetail({ after: { permissions: after } });
      return { role: role.key, permissions: after };
    });
  }
}
