import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { DeliveryModule } from "../delivery/delivery.module";
import { BRANCH_DAY_REPOSITORY } from "./domain/ports/branch-day-repository.port";
import { BRANCH_DAY_CHECKLIST_READER } from "./domain/ports/branch-day-checklist-reader.port";
import { BranchDayRepository } from "./infrastructure/persistence/branch-day.repository";
import { BranchDayChecklistReader } from "./infrastructure/persistence/branch-day-checklist-reader";
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
    { provide: BRANCH_DAY_REPOSITORY, useClass: BranchDayRepository },
    { provide: BRANCH_DAY_CHECKLIST_READER, useClass: BranchDayChecklistReader },
    GetBranchDayStatusHandler,
    CloseBranchDayHandler,
    ListBranchDayHistoryHandler,
  ],
})
export class BranchDayModule {}
