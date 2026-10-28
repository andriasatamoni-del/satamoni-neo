import { Inject, Injectable } from "@nestjs/common";
import { User } from "../../domain/user.aggregate";
import { UserNotFoundError } from "../../domain/errors";
import { PASSWORD_HASHER, type PasswordHasherPort } from "../../domain/ports/password-hasher.port";
import { auditDetail } from "../../../../shared/audit/audit-context";
import { ActiveAdminGuard } from "../services/active-admin-guard.service";

export interface UpdateUserCommand {
  userId: string;
  roles?: string[];
  branchId?: string | null;
  isActive?: boolean;
  password?: string;
}

function auditSnapshot(user: User) {
  return { roles: [...user.roles], branchId: user.branchId, isActive: user.isActive };
}

@Injectable()
export class UpdateUserHandler {
  constructor(
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    private readonly activeAdminGuard: ActiveAdminGuard
  ) {}

  async execute(command: UpdateUserCommand): Promise<User> {
    let passwordHash: string | undefined;
    if (command.password !== undefined) {
      User.validatePasswordPolicy(command.password);
      passwordHash = await this.hasher.hash(command.password);
    }

    const user = await this.activeAdminGuard.updateUser(command.userId, (u) => {
      auditDetail({ entityType: "users", entityId: u.id, before: auditSnapshot(u) });
      if (command.roles !== undefined) u.changeRoles(command.roles);
      if (command.branchId !== undefined) u.changeBranch(command.branchId);
      if (command.isActive === true) u.activate();
      if (command.isActive === false) u.deactivate();
      if (passwordHash !== undefined) u.setPasswordHash(passwordHash);
    });
    if (!user) throw new UserNotFoundError();

    auditDetail({ after: { ...auditSnapshot(user), passwordReset: command.password !== undefined } });
    return user;
  }
}
