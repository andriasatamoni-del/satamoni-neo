import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import type { User } from "../../domain/user.aggregate";
import { LastAdminError } from "../../domain/errors";
import type { Role } from "../../domain/role";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user-repository.port";
import { ROLE_REPOSITORY, type RoleRepositoryPort } from "../../domain/ports/role-repository.port";

const ACTIVE_ADMINS_LOCK = "identity:active-admins";

function isActiveFullAccessUser(user: User, fullAccessRoles: readonly Role[]): boolean {
  return user.isActive && user.roles.some((role) => fullAccessRoles.includes(role));
}

@Injectable()
export class ActiveAdminGuard {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  updateUser(userId: string, change: (user: User) => void): Promise<User | null> {
    return this.tx.run(async () => {
      await this.tx.advisoryLock(ACTIVE_ADMINS_LOCK);
      const user = await this.users.findById(userId);
      if (!user) return null;

      const fullAccessRoles = await this.roles.fullAccessKeys();
      const wasActiveAdmin = isActiveFullAccessUser(user, fullAccessRoles);
      change(user);
      if (
        wasActiveAdmin &&
        !isActiveFullAccessUser(user, fullAccessRoles) &&
        (await this.users.countActiveUsersWithRoles(fullAccessRoles)) <= 1
      ) {
        throw new LastAdminError();
      }

      await this.users.save(user);
      return user;
    });
  }
}
