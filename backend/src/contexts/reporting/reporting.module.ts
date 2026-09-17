import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { DASHBOARD_SUMMARY_READER } from "./domain/ports/dashboard-summary-reader.port";
import { KyselyDashboardSummaryReader } from "./infrastructure/persistence/kysely-dashboard-summary-reader";
import { GetDashboardSummaryHandler } from "./application/queries/get-dashboard-summary.handler";
import { ReportsController } from "./api/reports.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [ReportsController],
  providers: [
    { provide: DASHBOARD_SUMMARY_READER, useClass: KyselyDashboardSummaryReader },
    GetDashboardSummaryHandler,
  ],
})
export class ReportingModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "reports",
      groupLabel: "التقارير ولوحة التحكم",
      permissions: [{ key: "reports.view", label: "رؤية لوحة التحكم والتقارير" }],
    });
    // نفس canSeeReports في الريبو القديم بالظبط: أدمن + محاسب + مدير فرع (مش كاشير/كول سنتر/سائق)
    this.permissions.setRoleDefaults("accountant", ["reports.view"]);
    this.permissions.setRoleDefaults("branch_manager", ["reports.view"]);
  }
}
