import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import type { User } from "../../domain/user.aggregate";
import { LastAdminError } from "../../domain/errors";
import { hasAnyRole, ROLE } from "../../domain/role";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user-repository.port";

const ACTIVE_ADMINS_LOCK = "identity:active-admins";

function isActiveAdmin(user: User): boolean {
  return user.isActive && hasAnyRole(user.roles, ROLE.ADMIN);
}

@Injectable()
export class ActiveAdminGuard {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  updateUser(userId: string, change: (user: User) => void): Promise<User | null> {
    return this.tx.run(async () => {
      await this.tx.advisoryLock(ACTIVE_ADMINS_LOCK);
      const user = await this.users.findById(userId);
      if (!user) return null;

      const wasActiveAdmin = isActiveAdmin(user);
      change(user);
      if (wasActiveAdmin && !isActiveAdmin(user) && (await this.users.countActiveAdmins()) <= 1) {
        throw new LastAdminError();
      }

      await this.users.save(user);
      return user;
    });
  }
}
