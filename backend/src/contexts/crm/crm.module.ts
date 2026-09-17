import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { CUSTOMER_FOLLOWUP_REPOSITORY } from "./domain/ports/customer-followup-repository.port";
import { COMPLAINT_REPOSITORY } from "./domain/ports/complaint-repository.port";
import { KyselyCustomerFollowupRepository } from "./infrastructure/persistence/kysely-customer-followup.repository";
import { KyselyComplaintRepository } from "./infrastructure/persistence/kysely-complaint.repository";
import { RecordFollowupHandler } from "./application/commands/record-followup.handler";
import { RegisterComplaintHandler } from "./application/commands/register-complaint.handler";
import { UpdateComplaintStatusHandler } from "./application/commands/update-complaint-status.handler";
import { ListComplaintsHandler } from "./application/queries/list-complaints.handler";
import { GetLatestComplaintByPhoneHandler } from "./application/queries/get-latest-complaint-by-phone.handler";
import { CrmController } from "./api/crm.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [CrmController],
  providers: [
    { provide: CUSTOMER_FOLLOWUP_REPOSITORY, useClass: KyselyCustomerFollowupRepository },
    { provide: COMPLAINT_REPOSITORY, useClass: KyselyComplaintRepository },
    RecordFollowupHandler,
    RegisterComplaintHandler,
    UpdateComplaintStatusHandler,
    ListComplaintsHandler,
    GetLatestComplaintByPhoneHandler,
  ],
  exports: [RegisterComplaintHandler],
})
export class CrmModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  // نفس فلسفة IdentityAccessModule - كل context بيسجّل صلاحياته هو بس وقت الإقلاع
  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "crm",
      groupLabel: "متابعة العملاء والشكاوى",
      permissions: [
        { key: "crm.followups.record", label: "تسجيل مكالمة متابعة" },
        { key: "crm.complaints.view", label: "رؤية الشكاوى" },
        { key: "crm.complaints.manage", label: "إدارة/حل الشكاوى" },
      ],
    });
    this.permissions.setRoleDefaults("callcenter", [
      "crm.followups.record",
      "crm.complaints.view",
      "crm.complaints.manage",
    ]);
    this.permissions.setRoleDefaults("branch_manager", ["crm.complaints.view", "crm.complaints.manage"]);
  }
}
