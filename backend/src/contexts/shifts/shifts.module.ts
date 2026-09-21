import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { SettingsModule } from "../settings/settings.module";
import { CASHIER_SHIFT_REPOSITORY } from "./domain/ports/cashier-shift-repository.port";
import { SHIFT_FINANCIALS_READER } from "./domain/ports/shift-financials-reader.port";
import { CASH_DRAWER_ENTRY_REPOSITORY } from "./domain/ports/cash-drawer-entry-repository.port";
import { KyselyCashierShiftRepository } from "./infrastructure/persistence/kysely-cashier-shift.repository";
import { KyselyShiftFinancialsReader } from "./infrastructure/persistence/kysely-shift-financials-reader";
import { KyselyCashDrawerEntryRepository } from "./infrastructure/persistence/kysely-cash-drawer-entry.repository";
import { OpenShiftHandler } from "./application/commands/open-shift.handler";
import { CloseShiftHandler } from "./application/commands/close-shift.handler";
import { ReviewShiftVarianceHandler } from "./application/commands/review-shift-variance.handler";
import { RegisterCashDrawerEntryHandler } from "./application/commands/register-cash-drawer-entry.handler";
import { PreviewShiftHandler } from "./application/queries/preview-shift.handler";
import { ListShiftsHandler } from "./application/queries/list-shifts.handler";
import { ListCashDrawerEntriesHandler } from "./application/queries/list-cash-drawer-entries.handler";
import { ShiftsController } from "./api/shifts.controller";

@Module({
  imports: [IdentityAccessModule, SettingsModule],
  controllers: [ShiftsController],
  providers: [
    { provide: CASHIER_SHIFT_REPOSITORY, useClass: KyselyCashierShiftRepository },
    { provide: SHIFT_FINANCIALS_READER, useClass: KyselyShiftFinancialsReader },
    { provide: CASH_DRAWER_ENTRY_REPOSITORY, useClass: KyselyCashDrawerEntryRepository },
    OpenShiftHandler,
    CloseShiftHandler,
    ReviewShiftVarianceHandler,
    RegisterCashDrawerEntryHandler,
    PreviewShiftHandler,
    ListShiftsHandler,
    ListCashDrawerEntriesHandler,
  ],
})
export class ShiftsModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "shifts",
      groupLabel: "شيفتات الكاشير",
      permissions: [
        { key: "shifts.open_own", label: "فتح شيفت لنفسه" },
        { key: "shifts.close_own", label: "قفل شيفته" },
        { key: "shifts.view_own", label: "رؤية شيفته الحالي" },
        { key: "shifts.view_branch", label: "رؤية شيفتات الفرع" },
        { key: "shifts.review", label: "مراجعة فروق الكاش" },
        { key: "shifts.record_cash_entry", label: "تسجيل مصروف/مشترى من درج الشيفت" },
      ],
    });
    this.permissions.setRoleDefaults("cashier", [
      "shifts.open_own", "shifts.close_own", "shifts.view_own", "shifts.record_cash_entry",
    ]);
    this.permissions.setRoleDefaults("branch_manager", [
      "shifts.open_own", "shifts.close_own", "shifts.view_own", "shifts.view_branch", "shifts.review",
      "shifts.record_cash_entry",
    ]);
    this.permissions.setRoleDefaults("accountant", ["shifts.view_branch", "shifts.review"]);
  }
}
