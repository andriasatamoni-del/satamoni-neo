import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { DeliveryModule } from "../delivery/delivery.module";
import { BRANCH_DAY_REPOSITORY } from "./domain/ports/branch-day-repository.port";
import { BRANCH_DAY_CHECKLIST_READER } from "./domain/ports/branch-day-checklist-reader.port";
import { KyselyBranchDayRepository } from "./infrastructure/persistence/kysely-branch-day.repository";
import { KyselyBranchDayChecklistReader } from "./infrastructure/persistence/kysely-branch-day-checklist-reader";
import { GetBranchDayStatusHandler } from "./application/queries/get-branch-day-status.handler";
import { CloseBranchDayHandler } from "./application/commands/close-branch-day.handler";
import { ListBranchDayHistoryHandler } from "./application/queries/list-branch-day-history.handler";
import { BranchDayController } from "./api/branch-day.controller";

// قفل يوم الفرع - نفس تقسيم الصلاحيات في الريبو القديم بالظبط (routes/branch-days.js):
// branch_day.view للعرض (status/history)، branch_day.close للقفل الفعلي - مدير الفرع بس بياخد القفل،
// المحاسب بياخد view بس (مراجعة/تدقيق من غير صلاحية قفل يوم فرع مش بتاعه فعليًا)
@Module({
  imports: [IdentityAccessModule, DeliveryModule],
  controllers: [BranchDayController],
  providers: [
    { provide: BRANCH_DAY_REPOSITORY, useClass: KyselyBranchDayRepository },
    { provide: BRANCH_DAY_CHECKLIST_READER, useClass: KyselyBranchDayChecklistReader },
    GetBranchDayStatusHandler,
    CloseBranchDayHandler,
    ListBranchDayHistoryHandler,
  ],
})
export class BranchDayModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "branch_day",
      groupLabel: "قفل يوم الفرع",
      permissions: [
        { key: "branch_day.view", label: "رؤية حالة/سجل قفل يوم الفرع" },
        { key: "branch_day.close", label: "قفل يوم الفرع" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["branch_day.view", "branch_day.close"]);
    this.permissions.setRoleDefaults("accountant", ["branch_day.view"]);
  }
}
