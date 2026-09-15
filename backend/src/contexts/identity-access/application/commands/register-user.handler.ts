import { Inject, Injectable } from "@nestjs/common";
import { User } from "../../domain/user.aggregate";
import { DuplicateEmailError } from "../../domain/errors";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user-repository.port";
import { PASSWORD_HASHER, type PasswordHasherPort } from "../../domain/ports/password-hasher.port";
import { UserRegisteredEvent } from "../../domain/events/user-registered.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";

export interface RegisterUserCommand {
  name: string;
  email: string;
  password: string;
  role: string;
  branchId?: string | null;
  legacyUserId?: number | null;
}

@Injectable()
export class RegisterUserHandler {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: RegisterUserCommand): Promise<User> {
    if (await this.users.existsByEmail(command.email)) {
      throw new DuplicateEmailError(command.email);
    }
    User.validatePasswordPolicy(command.password);
    const passwordHash = await this.hasher.hash(command.password);

    const user = User.register({
      name: command.name,
      email: command.email,
      passwordHash,
      role: command.role,
      branchId: command.branchId,
      legacyUserId: command.legacyUserId,
    });

    await this.users.save(user);
    await this.eventBus.publish(new UserRegisteredEvent(user.id, user.email, user.role));
    return user;
  }
}
