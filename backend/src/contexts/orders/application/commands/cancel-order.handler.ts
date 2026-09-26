import { Inject, Injectable } from "@nestjs/common";
import { Order } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import { OrderNotFoundError } from "../../domain/errors";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../../catalog/domain/ports/combo-repository.port";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../../catalog/domain/ports/recipe-repository.port";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../../inventory/domain/ports/stock-movement-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { OrderCancelledEvent } from "../../domain/events/order-cancelled.event";

export interface CancelOrderCommand {
  orderId: string;
  cancelledBy?: string | null;
}

// إلغاء طلب حقيقي - عكس كامل لاستهلاك المخزون (ADJUSTMENT موجب لكل مكوّن استُهلك وقت التسجيل، نفس
// تجميع الاستهلاك في RegisterOrderHandler بالظبط بس بالعكس)، status='cancelled' (setStatus بيرفض لو
// الطلب completed/cancelled بالفعل من غير أي تدخل هنا)، وبعدها نشر OrderCancelledEvent عشان Accounting
// يعكس قيد البيع التلقائي - أبدًا DELETE، نفس فلسفة الريبو القديم بالظبط ("مسار الاسترجاع الوحيد").
@Injectable()
export class CancelOrderHandler {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort,
    @Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: CancelOrderCommand): Promise<Order> {
    const order = await this.orders.findById(command.orderId);
    if (!order) throw new OrderNotFoundError();

    const variantConsumptions: { variantId: string; quantity: number }[] = [];
    for (const item of order.items) {
      if (item.comboId) {
        const combo = await this.combos.findById(item.comboId);
        for (const component of combo?.items ?? []) {
          variantConsumptions.push({ variantId: component.variantId, quantity: component.quantity * item.quantity });
        }
      } else if (item.variantId) {
        variantConsumptions.push({ variantId: item.variantId, quantity: item.quantity });
      }
    }

    const requiredByIngredient = new Map<string, number>();
    for (const consumption of variantConsumptions) {
      const recipe = await this.recipes.findByVariantId(consumption.variantId);
      const activeVersion = recipe?.activeVersion;
      if (!activeVersion) continue;
      for (const ingredient of activeVersion.ingredients) {
        const current = requiredByIngredient.get(ingredient.ingredientItemId) ?? 0;
        requiredByIngredient.set(ingredient.ingredientItemId, current + ingredient.quantity * consumption.quantity);
      }
    }

    order.setStatus("cancelled");
    await this.orders.save(order);

    for (const [ingredientItemId, requiredQty] of requiredByIngredient) {
      const movement = StockMovement.register({
        inventoryItemId: ingredientItemId,
        branchId: order.branchId,
        movementType: "ADJUSTMENT",
        quantityDelta: requiredQty,
        referenceType: "order_cancellation",
        referenceId: order.id,
        performedBy: command.cancelledBy,
      });
      await this.movements.recordMovement(movement, { allowNegativeBalance: true });
    }

    await this.eventBus.publish(new OrderCancelledEvent(order.id, order.branchId, order.total, command.cancelledBy ?? null));

    return order;
  }
}
