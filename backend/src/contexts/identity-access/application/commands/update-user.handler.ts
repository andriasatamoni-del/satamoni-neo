import { Inject, Injectable } from "@nestjs/common";
import { User } from "../../domain/user.aggregate";
import { UserNotFoundError } from "../../domain/errors";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user-repository.port";
import { PASSWORD_HASHER, type PasswordHasherPort } from "../../domain/ports/password-hasher.port";
import { auditDetail } from "../../../../shared/audit/audit-context";

export interface UpdateUserCommand {
  userId: string;
  roles?: string[];
  branchId?: string | null;
  isActive?: boolean;
  password?: string; // إعادة تعيين كلمة سر (نسيان/فقدان) - الأدمن بس، نفس صلاحية identity.users.manage
}

@Injectable()
export class UpdateUserHandler {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort
  ) {}

  async execute(command: UpdateUserCommand): Promise<User> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new UserNotFoundError();
    // audit evidence: roles / branch / active changes (never the password or its hash)
    const snapshot = () => ({ roles: [...user.roles], branchId: user.branchId, isActive: user.isActive });
    auditDetail({ entityType: "users", entityId: user.id, before: snapshot() });

    if (command.roles !== undefined) user.changeRoles(command.roles);
    if (command.branchId !== undefined) user.changeBranch(command.branchId);
    if (command.isActive === true) user.activate();
    if (command.isActive === false) user.deactivate();

    if (command.password !== undefined) {
      User.validatePasswordPolicy(command.password);
      user.setPasswordHash(await this.hasher.hash(command.password));
    }

    await this.users.save(user);
    auditDetail({ after: { ...snapshot(), passwordReset: command.password !== undefined } });
    return user;
  }
}
