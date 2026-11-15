import { Inject, Injectable } from "@nestjs/common";
import { ROLE_REPOSITORY, type RoleRepositoryPort, type RoleSummary } from "../../domain/ports/role-repository.port";

@Injectable()
export class ListRolesHandler {
  constructor(@Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort) {}

  execute(): Promise<RoleSummary[]> {
    return this.roles.list();
  }
}
