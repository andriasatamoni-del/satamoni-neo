import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { auditDetail } from "../../../../shared/audit/audit-context";
import { DuplicateRoleLabelError, RoleNotFoundError } from "../../domain/errors";
import type { RoleDefinition } from "../../domain/role-definition.aggregate";
import type { Role, RoleScope } from "../../domain/role";
import { ROLE_REPOSITORY, type RoleRepositoryPort } from "../../domain/ports/role-repository.port";

export interface UpdateRoleCommand {
  key: Role;
  label?: string;
  scope?: RoleScope;
}

@Injectable()
export class UpdateRoleHandler {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: UpdateRoleCommand): Promise<RoleDefinition> {
    return this.tx.run(async () => {
      const role = await this.roles.findByKey(command.key);
      if (!role) throw new RoleNotFoundError();
      auditDetail({ entityType: "roles", entityId: role.key, before: { label: role.label, scope: role.scope } });

      if (command.label !== undefined && command.label.trim() !== role.label) {
        if (await this.roles.isLabelTaken(command.label, role.key)) throw new DuplicateRoleLabelError(command.label.trim());
        role.rename(command.label);
      }
      if (command.scope !== undefined && command.scope !== role.scope) role.changeScope(command.scope);

      await this.roles.save(role);
      auditDetail({ after: { label: role.label, scope: role.scope } });
      return role;
    });
  }
}
