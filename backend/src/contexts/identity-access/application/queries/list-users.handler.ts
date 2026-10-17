import { Inject, Injectable } from "@nestjs/common";
import { USER_REPOSITORY, type UserListFilter, type UserRepositoryPort } from "../../domain/ports/user-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListUsersHandler {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort) {}

  execute(filter: UserListFilter = {}, page?: PageRequest) {
    return this.users.search(filter, page);
  }
}
