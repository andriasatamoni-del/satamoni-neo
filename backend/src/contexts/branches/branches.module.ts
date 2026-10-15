import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { BRANCH_REPOSITORY } from "./domain/ports/branch-repository.port";
import { BranchRepository } from "./infrastructure/persistence/branch.repository";
import { RegisterBranchHandler } from "./application/commands/register-branch.handler";
import { UpdateBranchHandler } from "./application/commands/update-branch.handler";
import { ListBranchesHandler } from "./application/queries/list-branches.handler";
import { BranchesController } from "./api/branches.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [BranchesController],
  providers: [
    { provide: BRANCH_REPOSITORY, useClass: BranchRepository },
    RegisterBranchHandler,
    UpdateBranchHandler,
    ListBranchesHandler,
  ],
  exports: [BRANCH_REPOSITORY],
})
export class BranchesModule {}
