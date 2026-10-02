import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { BranchesModule } from "../branches/branches.module";
import { CustomersModule } from "../customers/customers.module";
import { SettingsModule } from "../settings/settings.module";
import { LoyaltyModule } from "../loyalty/loyalty.module";
import { STOREFRONT_READER } from "./domain/ports/storefront-reader.port";
import { KyselyStorefrontReader } from "./infrastructure/persistence/kysely-storefront.reader";
import { GetStorefrontMenuHandler } from "./application/queries/get-storefront-menu.handler";
import { PlaceOnlineOrderHandler } from "./application/commands/place-online-order.handler";
import { TrackOnlineOrderHandler } from "./application/queries/track-online-order.handler";
import { ListMyOnlineOrdersHandler } from "./application/queries/list-my-online-orders.handler";
import { StorefrontController } from "./api/storefront.controller";

// Storefront - واجهة العميل العامة (موقع الطلب). مالهاش aggregate خاص بيها: بتركّب Orders (تسجيل الطلب
// بنفس مسار الكاشير) + Customers (الحساب الاختياري) + Catalog/Branches (read model للمنيو)
@Module({
  imports: [OrdersModule, BranchesModule, CustomersModule, SettingsModule, LoyaltyModule],
  controllers: [StorefrontController],
  providers: [
    { provide: STOREFRONT_READER, useClass: KyselyStorefrontReader },
    GetStorefrontMenuHandler,
    PlaceOnlineOrderHandler,
    TrackOnlineOrderHandler,
    ListMyOnlineOrdersHandler,
  ],
})
export class StorefrontModule {}
