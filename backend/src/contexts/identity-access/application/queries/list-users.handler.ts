import { Inject, Injectable } from "@nestjs/common";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user-repository.port";

@Injectable()
export class ListUsersHandler {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort) {}

  execute(filter?: { branchId?: string | null }) {
    return this.users.list(filter);
  }
}
