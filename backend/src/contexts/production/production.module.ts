import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { CatalogModule } from "../catalog/catalog.module";
import { InventoryModule } from "../inventory/inventory.module";
import { SettingsModule } from "../settings/settings.module";
import { CONVERSION_ORDER_REPOSITORY } from "./domain/ports/conversion-order-repository.port";
import { ConversionOrderRepository } from "./infrastructure/persistence/conversion-order.repository";
import { RegisterConversionOrderHandler } from "./application/commands/register-conversion-order.handler";
import { ApproveConversionOrderHandler } from "./application/commands/approve-conversion-order.handler";
import { StartConversionOrderHandler } from "./application/commands/start-conversion-order.handler";
import { CompleteConversionOrderHandler } from "./application/commands/complete-conversion-order.handler";
import { CancelConversionOrderHandler } from "./application/commands/cancel-conversion-order.handler";
import { ListConversionOrdersHandler } from "./application/queries/list-conversion-orders.handler";
import { GetConversionOrderHandler } from "./application/queries/get-conversion-order.handler";
import { GetProductionPlanHandler } from "./application/queries/get-production-plan.handler";
import { GetRawMaterialRequirementHandler } from "./application/queries/get-raw-material-requirement.handler";
import { ProductionController } from "./api/production.controller";

@Module({
  imports: [IdentityAccessModule, CatalogModule, InventoryModule, SettingsModule],
  controllers: [ProductionController],
  providers: [
    { provide: CONVERSION_ORDER_REPOSITORY, useClass: ConversionOrderRepository },
    RegisterConversionOrderHandler,
    ApproveConversionOrderHandler,
    StartConversionOrderHandler,
    CompleteConversionOrderHandler,
    CancelConversionOrderHandler,
    ListConversionOrdersHandler,
    GetConversionOrderHandler,
    GetProductionPlanHandler,
    GetRawMaterialRequirementHandler,
  ],
})
export class ProductionModule {}
