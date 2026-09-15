import { Inject, Injectable } from "@nestjs/common";
import { User } from "../../domain/user.aggregate";
import { UnknownPermissionError, UserNotFoundError } from "../../domain/errors";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user-repository.port";
import { PermissionRegistry } from "../../../../shared/permissions/permission-registry";

export interface UpdateUserCommand {
  userId: string;
  role?: string;
  branchId?: string | null;
  isActive?: boolean;
  permissionKeys?: string[]; // لو مبعوتة، بتستبدل كل الاستثناءات الحالية (نفس PATCH /api/users/:id القديم)
}

@Injectable()
export class UpdateUserHandler {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly permissions: PermissionRegistry
  ) {}

  async execute(command: UpdateUserCommand): Promise<User> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new UserNotFoundError();

    // لو الدور بيتغيّر في نفس الطلب، الصلاحيات (لو مبعوتة) بتتحسب مقابل الدور الجديد - نفس منطق
    // الريبو القديم (المرحلة 8.58) اللي بيخلي الأدمن يغيّر الدور ويظبط الصلاحيات مرة واحدة
    if (command.role !== undefined) user.changeRole(command.role);
    if (command.branchId !== undefined) user.changeBranch(command.branchId);
    if (command.isActive === true) user.activate();
    if (command.isActive === false) user.deactivate();

    if (command.permissionKeys !== undefined) {
      const unknown = command.permissionKeys.filter((k) => !this.permissions.isKnownPermission(k));
      if (unknown.length > 0) throw new UnknownPermissionError(unknown);
      const roleDefaults = user.role === "admin"
        ? new Set(this.permissions.getAllKeys())
        : this.permissions.getRoleDefaults(user.role);
      user.replacePermissionOverrides(command.permissionKeys, roleDefaults);
    }

    await this.users.save(user);
    return user;
  }
}
