import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ProcurementModule } from "../procurement/procurement.module";
import { PURCHASE_REPOSITORY } from "./domain/ports/purchase-repository.port";
import { PurchaseRepository } from "./infrastructure/persistence/purchase.repository";
import { RegisterPurchaseHandler } from "./application/commands/register-purchase.handler";
import { EditPurchaseHandler } from "./application/commands/edit-purchase.handler";
import { ConfirmPurchaseHandler } from "./application/commands/confirm-purchase.handler";
import { RejectPurchaseHandler } from "./application/commands/reject-purchase.handler";
import { ListPurchasesHandler } from "./application/queries/list-purchases.handler";
import { GetPurchaseHandler } from "./application/queries/get-purchase.handler";
import { PurchaseDuplicateCheckService } from "../../shared/procurement/purchase-duplicate-check.service";
import { PurchasesController } from "./api/purchases.controller";

@Module({
  imports: [IdentityAccessModule, InventoryModule, ProcurementModule],
  controllers: [PurchasesController],
  providers: [
    { provide: PURCHASE_REPOSITORY, useClass: PurchaseRepository },
    PurchaseDuplicateCheckService,
    RegisterPurchaseHandler,
    EditPurchaseHandler,
    ConfirmPurchaseHandler,
    RejectPurchaseHandler,
    ListPurchasesHandler,
    GetPurchaseHandler,
  ],
})
export class PurchasesModule {}
