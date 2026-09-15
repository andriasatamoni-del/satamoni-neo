import { Inject, Injectable } from "@nestjs/common";
import { Order } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import { VariantNotFoundForOrderError, InsufficientStockForOrderError } from "../../domain/errors";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../../catalog/domain/ports/menu-item-repository.port";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../../catalog/domain/ports/recipe-repository.port";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemRepositoryPort,
} from "../../../inventory/domain/ports/inventory-item-repository.port";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../../inventory/domain/ports/stock-movement-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { OrderRegisteredEvent } from "../../domain/events/order-registered.event";

export interface RegisterOrderCommand {
  branchId: string;
  orderType: string;
  tableNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  addressDetails?: string | null;
  items: { variantId: string; quantity: number }[];
  discount?: number;
  createdBy?: string | null;
  // موافقة صريحة تسمح باستهلاك يخلي رصيد صنف معينه ALLOW_WITH_APPROVAL يروح سالب - نفس فلسفة
  // Inventory/Procurement بالظبط
  stockApproved?: boolean;
}

// بيسجّل الطلب ويستهلك المخزون النظري (عن طريق الوصفة النشطة لكل حجم) في نفس الطلب - مرحلتين:
// 1) يجمع الكمية المطلوبة من كل مكوّن عبر كل أصناف الطلب، ويتأكد إن الرصيد كافي **قبل** ما يرحّل أي
//    حركة (بدل ما يبدأ يرحّل صنف صنف ويوقف في النص لو صنف متأخر مش كفاية - كان هيسيب استهلاك جزئي
//    مش متسق). لو صنف من غير وصفة معرّفة لسه، بيتسجّل الطلب عادي من غير استهلاك ليه (مش خطأ).
// 2) بعد ما التأكد يعدي لكل المكوّنات، يرحّل حركة CONSUMPTION حقيقية لكل مكوّن في Inventory context.
@Injectable()
export class RegisterOrderHandler {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(MENU_ITEM_REPOSITORY) private readonly menuItems: MenuItemRepositoryPort,
    @Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly inventoryItems: InventoryItemRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: RegisterOrderCommand): Promise<Order> {
    const resolvedItems: { menuItemId: string; variantId: string; quantity: number; unitPrice: number }[] = [];
    for (const item of command.items) {
      const menuItem = await this.menuItems.findByVariantId(item.variantId);
      const variant = menuItem?.variants.find((v) => v.id === item.variantId);
      if (!menuItem || !variant) throw new VariantNotFoundForOrderError();
      resolvedItems.push({ menuItemId: menuItem.id, variantId: item.variantId, quantity: item.quantity, unitPrice: variant.price });
    }

    // تجميع الاستهلاك المطلوب لكل مكوّن عبر كل أصناف الطلب
    const requiredByIngredient = new Map<string, number>();
    for (const item of resolvedItems) {
      const recipe = await this.recipes.findByVariantId(item.variantId);
      const activeVersion = recipe?.activeVersion;
      if (!activeVersion) continue; // مفيش وصفة نشطة لسه - مفيش استهلاك ليه، مش خطأ
      for (const ingredient of activeVersion.ingredients) {
        const current = requiredByIngredient.get(ingredient.ingredientItemId) ?? 0;
        requiredByIngredient.set(ingredient.ingredientItemId, current + ingredient.quantity * item.quantity);
      }
    }

    // التأكد من الرصيد لكل مكوّن قبل ما نرحّل أي حاجة
    for (const [ingredientItemId, requiredQty] of requiredByIngredient) {
      const inventoryItem = await this.inventoryItems.findById(ingredientItemId);
      if (!inventoryItem) continue;
      const allowNegative = inventoryItem.negativeStockPolicy === "ALLOW_WITH_APPROVAL" && !!command.stockApproved;
      if (!allowNegative) {
        const balance = await this.movements.getBalance(command.branchId, ingredientItemId);
        if (balance - requiredQty < 0) throw new InsufficientStockForOrderError(inventoryItem.name);
      }
    }

    const order = Order.register({ ...command, items: resolvedItems });
    await this.orders.save(order);

    for (const [ingredientItemId, requiredQty] of requiredByIngredient) {
      const inventoryItem = await this.inventoryItems.findById(ingredientItemId);
      const allowNegative = inventoryItem?.negativeStockPolicy === "ALLOW_WITH_APPROVAL" && !!command.stockApproved;
      const movement = StockMovement.register({
        inventoryItemId: ingredientItemId,
        branchId: command.branchId,
        movementType: "CONSUMPTION",
        quantityDelta: -requiredQty,
        referenceType: "order",
        referenceId: order.id,
        performedBy: command.createdBy,
      });
      await this.movements.recordMovement(movement, { allowNegativeBalance: allowNegative });
    }

    // بعد ما الطلب اتسجّل ونجح خالص (بما فيه استهلاك المخزون) - مش قبل كده. فشل subscriber هنا
    // (زي ترحيل القيد المحاسبي) مبيرجّعش الطلب نفسه فاشل (راجع تعليق EventBusService.publish)
    await this.eventBus.publish(new OrderRegisteredEvent(order.id, order.branchId, order.total, command.createdBy ?? null));

    return order;
  }
}
