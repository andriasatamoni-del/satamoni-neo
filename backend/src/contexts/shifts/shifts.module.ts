import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { SettingsModule } from "../settings/settings.module";
import { CASHIER_SHIFT_REPOSITORY } from "./domain/ports/cashier-shift-repository.port";
import { SHIFT_FINANCIALS_READER } from "./domain/ports/shift-financials-reader.port";
import { CASH_DRAWER_ENTRY_REPOSITORY } from "./domain/ports/cash-drawer-entry-repository.port";
import { CashierShiftRepository } from "./infrastructure/persistence/cashier-shift.repository";
import { ShiftFinancialsReader } from "./infrastructure/persistence/shift-financials-reader";
import { CashDrawerEntryRepository } from "./infrastructure/persistence/cash-drawer-entry.repository";
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
    { provide: CASHIER_SHIFT_REPOSITORY, useClass: CashierShiftRepository },
    { provide: SHIFT_FINANCIALS_READER, useClass: ShiftFinancialsReader },
    { provide: CASH_DRAWER_ENTRY_REPOSITORY, useClass: CashDrawerEntryRepository },
    OpenShiftHandler,
    CloseShiftHandler,
    ReviewShiftVarianceHandler,
    RegisterCashDrawerEntryHandler,
    PreviewShiftHandler,
    ListShiftsHandler,
    ListCashDrawerEntriesHandler,
  ],
})
export class ShiftsModule {}
