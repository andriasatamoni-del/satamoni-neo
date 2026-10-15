import { Inject, Injectable } from "@nestjs/common";
import { AdminRolePermissionsLockedError, InvalidRoleError, UnknownPermissionError } from "../../domain/errors";
import { isValidRole, ROLE, type Role } from "../../domain/role";
import { ROLE_PERMISSION_REPOSITORY, type RolePermissionRepositoryPort } from "../../domain/ports/role-permission-repository.port";
import { auditDetail } from "../../../../shared/audit/audit-context";

export interface UpdateRolePermissionsCommand {
  role: string;
  permissionKeys: string[];
}

@Injectable()
export class UpdateRolePermissionsHandler {
  constructor(@Inject(ROLE_PERMISSION_REPOSITORY) private readonly rolePermissions: RolePermissionRepositoryPort) {}

  async execute(command: UpdateRolePermissionsCommand): Promise<{ role: Role; permissions: string[] }> {
    if (!isValidRole(command.role)) throw new InvalidRoleError(command.role);
    if (command.role === ROLE.ADMIN) throw new AdminRolePermissionsLockedError();
    const role = command.role;

    const unknown = await this.rolePermissions.unknownKeys(command.permissionKeys);
    if (unknown.length > 0) throw new UnknownPermissionError(unknown);

    const before = (await this.rolePermissions.allRolePermissions())[role];
    auditDetail({ entityType: "role_permissions", entityId: role, before: { permissions: before } });

    await this.rolePermissions.replaceRolePermissions(role, command.permissionKeys);

    const after = (await this.rolePermissions.allRolePermissions())[role];
    auditDetail({ after: { permissions: after } });
    return { role, permissions: after };
  }
}
