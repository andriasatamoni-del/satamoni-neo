import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { BRANCH_REPOSITORY } from "./domain/ports/branch-repository.port";
import { KyselyBranchRepository } from "./infrastructure/persistence/kysely-branch.repository";
import { RegisterBranchHandler } from "./application/commands/register-branch.handler";
import { UpdateBranchHandler } from "./application/commands/update-branch.handler";
import { ListBranchesHandler } from "./application/queries/list-branches.handler";
import { BranchesController } from "./api/branches.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [BranchesController],
  providers: [
    { provide: BRANCH_REPOSITORY, useClass: KyselyBranchRepository },
    RegisterBranchHandler,
    UpdateBranchHandler,
    ListBranchesHandler,
  ],
  exports: [BRANCH_REPOSITORY],
})
export class BranchesModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "branches",
      groupLabel: "الفروع",
      permissions: [
        { key: "branches.view", label: "رؤية الفروع" },
        { key: "branches.manage", label: "إدارة الفروع" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["branches.view"]);
  }
}
