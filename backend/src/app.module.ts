import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { HealthController } from "./health.controller";
import { DatabaseModule } from "./shared/database/database.module";
import { EventsModule } from "./shared/events/events.module";
import { PermissionsModule } from "./shared/permissions/permissions.module";
import { AuditModule } from "./shared/audit/audit.module";
import { IdentityAccessModule } from "./contexts/identity-access/identity-access.module";
import { CrmModule } from "./contexts/crm/crm.module";
import { BranchesModule } from "./contexts/branches/branches.module";
import { InventoryModule } from "./contexts/inventory/inventory.module";
import { CatalogModule } from "./contexts/catalog/catalog.module";
import { ProductionModule } from "./contexts/production/production.module";
import { WhatsappModule } from "./contexts/whatsapp/whatsapp.module";
import { ProcurementModule } from "./contexts/procurement/procurement.module";
import { OrdersModule } from "./contexts/orders/orders.module";
import { DeliveryModule } from "./contexts/delivery/delivery.module";
import { AccountingModule } from "./contexts/accounting/accounting.module";
import { PaymentControlModule } from "./contexts/payment-control/payment-control.module";
import { HrPayrollModule } from "./contexts/hr-payroll/hr-payroll.module";
import { ShiftsModule } from "./contexts/shifts/shifts.module";
import { ReportingModule } from "./contexts/reporting/reporting.module";
import { TreasuryModule } from "./contexts/treasury/treasury.module";
import { PrintingModule } from "./contexts/printing/printing.module";
import { SettingsModule } from "./contexts/settings/settings.module";
import { BranchDayModule } from "./contexts/branch-day/branch-day.module";
import { ExpensesModule } from "./contexts/expenses/expenses.module";
import { PurchasesModule } from "./contexts/purchases/purchases.module";
import { CustomersModule } from "./contexts/customers/customers.module";
import { TalabatModule } from "./contexts/talabat/talabat.module";
import { HomeTilesModule } from "./contexts/home-tiles/home-tiles.module";

@Module({
  imports: [
    // حماية عامة من brute-force/DoS بسيط على كل الـAPI - حد افتراضي سخي (100 طلب/دقيقة لكل IP)،
    // وحد أضيق مخصوص على POST /auth/login (راجع @Throttle هناك) عشان محاولات تخمين كلمة السر تتقفل
    // بعد عدد قليل من المحاولات الفاشلة. THROTTLE_LIMIT قابل للتعديل عبر بيئة التشغيل - بيئة الاختبار
    // (test/integration/setup.ts) بترفعه عشان اختبارات الـe2e بتعمل عشرات طلبات متتالية على نفس IP
    // في نفس الدقيقة كسيناريو اختبار طبيعي، مش هجوم فعلي
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT) || 100 }]),
    DatabaseModule,
    EventsModule,
    PermissionsModule,
    AuditModule,
    IdentityAccessModule,
    SettingsModule,
    BranchesModule,
    CrmModule,
    InventoryModule,
    CatalogModule,
    ProductionModule,
    ProcurementModule,
    OrdersModule,
    WhatsappModule,
    DeliveryModule,
    AccountingModule,
    PaymentControlModule,
    HrPayrollModule,
    ShiftsModule,
    ReportingModule,
    TreasuryModule,
    PrintingModule,
    BranchDayModule,
    ExpensesModule,
    PurchasesModule,
    CustomersModule,
    TalabatModule,
    HomeTilesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
