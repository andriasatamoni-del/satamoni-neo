import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ProcurementModule } from "../procurement/procurement.module";
import { PURCHASE_REPOSITORY } from "./domain/ports/purchase-repository.port";
import { KyselyPurchaseRepository } from "./infrastructure/persistence/kysely-purchase.repository";
import { RegisterPurchaseHandler } from "./application/commands/register-purchase.handler";
import { EditPurchaseHandler } from "./application/commands/edit-purchase.handler";
import { ConfirmPurchaseHandler } from "./application/commands/confirm-purchase.handler";
import { RejectPurchaseHandler } from "./application/commands/reject-purchase.handler";
import { ListPurchasesHandler } from "./application/queries/list-purchases.handler";
import { GetPurchaseHandler } from "./application/queries/get-purchase.handler";
import { PurchasesController } from "./api/purchases.controller";

@Module({
  imports: [IdentityAccessModule, InventoryModule, ProcurementModule],
  controllers: [PurchasesController],
  providers: [
    { provide: PURCHASE_REPOSITORY, useClass: KyselyPurchaseRepository },
    RegisterPurchaseHandler,
    EditPurchaseHandler,
    ConfirmPurchaseHandler,
    RejectPurchaseHandler,
    ListPurchasesHandler,
    GetPurchaseHandler,
  ],
})
export class PurchasesModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "purchases",
      groupLabel: "المشتريات النقدية",
      permissions: [
        { key: "purchases.view", label: "رؤية كل المشتريات النقدية" },
        { key: "purchases.view_own_daily", label: "رؤية مشترياته النقدية (فرعه/النهاردة)" },
        { key: "purchases.create", label: "تسجيل مشترى نقدي (كامل، أي فرع، يترحّل فورًا)" },
        { key: "purchases.create_own_daily", label: "تسجيل مشترى نقدي (كاشير - فرعه/النهاردة بس)" },
        { key: "purchases.edit_own_daily", label: "تعديل مشترى نقدي معلّق (فرعه/النهاردة)" },
        { key: "purchases.review", label: "مراجعة واعتماد/رفض مشترى نقدي معلّق" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", [
      "purchases.view",
      "purchases.create",
      "purchases.edit_own_daily",
      "purchases.review",
    ]);
    this.permissions.setRoleDefaults("accountant", [
      "purchases.view",
      "purchases.create",
      "purchases.edit_own_daily",
      "purchases.review",
    ]);
    this.permissions.setRoleDefaults("cashier", ["purchases.create_own_daily", "purchases.view_own_daily", "purchases.edit_own_daily"]);
  }
}
