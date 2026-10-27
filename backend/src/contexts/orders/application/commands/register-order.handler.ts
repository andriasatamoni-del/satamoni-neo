import { Inject, Injectable } from "@nestjs/common";
import { Order, type OrderItemModifierLine, type OrderSource } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import {
  VariantNotFoundForOrderError,
  InsufficientStockForOrderError,
  ModifierNotFoundForOrderError,
  ComboNotFoundForOrderError,
  CustomerNotFoundForOrderError,
  DeliveryAddressRequiredError,
} from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../../customers/domain/ports/customer-repository.port";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../../catalog/domain/ports/menu-item-repository.port";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../../catalog/domain/ports/recipe-repository.port";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../../catalog/domain/ports/combo-repository.port";
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
import { TransactionService } from "../../../../shared/database/transaction-context";
import { InsufficientStockError } from "../../../inventory/domain/errors";

export interface RegisterOrderCommand {
  branchId: string;
  orderType: string;
  tableNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  addressDetails?: string | null;
  customerId?: string | null;
  customerAddressId?: string | null;
  items: { variantId?: string; comboId?: string; quantity: number; modifierIds?: string[] }[];
  discount?: number;
  createdBy?: string | null;
  stockApproved?: boolean;
  paymentMethodId?: string | null;
  clientRequestId?: string | null;
  source?: OrderSource;
  customerNotes?: string | null;
}

@Injectable()
export class RegisterOrderHandler {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(MENU_ITEM_REPOSITORY) private readonly menuItems: MenuItemRepositoryPort,
    @Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort,
    @Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly inventoryItems: InventoryItemRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort,
    private readonly eventBus: EventBusService,
    private readonly tx: TransactionService
  ) {}

  async execute(command: RegisterOrderCommand): Promise<Order> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: RegisterOrderCommand): Promise<Order> {
    if (command.clientRequestId) {
      await this.tx.advisoryLock(`order-client-request:${command.clientRequestId}`);
      const existing = await this.orders.findByClientRequestId(command.clientRequestId);
      if (existing) return existing;
    }

    const resolvedItems: {
      menuItemId: string | null;
      variantId: string | null;
      comboId: string | null;
      quantity: number;
      unitPrice: number;
      modifiers: OrderItemModifierLine[];
    }[] = [];
    const comboLineComponents = new Map<string, { variantId: string; quantity: number }[]>();
    for (const item of command.items) {
      if (item.comboId) {
        const combo = await this.combos.findById(item.comboId);
        if (!combo || !combo.isActive || (combo.onlineOnly && command.source !== "website")) throw new ComboNotFoundForOrderError();

        resolvedItems.push({
          menuItemId: null,
          variantId: null,
          comboId: combo.id,
          quantity: item.quantity,
          unitPrice: combo.price,
          modifiers: [],
        });
        comboLineComponents.set(combo.id, combo.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })));
        continue;
      }

      if (!item.variantId) throw new VariantNotFoundForOrderError();
      const menuItem = await this.menuItems.findByVariantId(item.variantId);
      const variant = menuItem?.variants.find((v) => v.id === item.variantId);
      if (!menuItem || !variant) throw new VariantNotFoundForOrderError();

      const modifiers: OrderItemModifierLine[] = [];
      let modifierTotal = 0;
      for (const modifierId of item.modifierIds ?? []) {
        const modifier = menuItem.modifiers.find((m) => m.id === modifierId && m.isActive);
        if (!modifier) throw new ModifierNotFoundForOrderError();
        const priceAtSale = menuItem.resolveModifierPrice(modifierId, item.variantId);
        modifiers.push({ modifierId: modifier.id, nameAtSale: modifier.name, priceAtSale });
        modifierTotal += priceAtSale;
      }

      resolvedItems.push({
        menuItemId: menuItem.id,
        variantId: item.variantId,
        comboId: null,
        quantity: item.quantity,
        unitPrice: variant.price + modifierTotal,
        modifiers,
      });
    }

    const variantConsumptions: { variantId: string; quantity: number }[] = [];
    for (const item of resolvedItems) {
      if (item.comboId) {
        for (const component of comboLineComponents.get(item.comboId) ?? []) {
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
      if (!activeVersion) continue; // مفيش وصفة نشطة لسه - مفيش استهلاك ليه، مش خطأ
      for (const ingredient of activeVersion.ingredients) {
        const current = requiredByIngredient.get(ingredient.ingredientItemId) ?? 0;
        requiredByIngredient.set(ingredient.ingredientItemId, current + ingredient.quantity * consumption.quantity);
      }
    }

    for (const [ingredientItemId, requiredQty] of requiredByIngredient) {
      const inventoryItem = await this.inventoryItems.findById(ingredientItemId);
      if (!inventoryItem) continue;
      const allowNegative = inventoryItem.negativeStockPolicy === "ALLOW_WITH_APPROVAL" && !!command.stockApproved;
      if (!allowNegative) {
        const balance = await this.movements.getBalance(command.branchId, ingredientItemId);
        if (balance - requiredQty < 0) throw new InsufficientStockForOrderError(inventoryItem.name);
      }
    }

    const customerContact = await this.resolveCustomerContact(command);
    const order = Order.register({ ...command, ...customerContact, items: resolvedItems });
    await this.orders.save(order);

    let costOfGoodsSold = 0;
    let costIncomplete = false;
    const sortedIngredients = [...requiredByIngredient.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [ingredientItemId, requiredQty] of sortedIngredients) {
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
        unitCost: inventoryItem?.unitCost ?? null,
      });
      if (movement.totalCost === null) costIncomplete = true;
      else costOfGoodsSold += movement.totalCost;
      try {
        await this.movements.recordMovement(movement, { allowNegativeBalance: allowNegative });
      } catch (err) {
        if (err instanceof InsufficientStockError) throw new InsufficientStockForOrderError(inventoryItem?.name ?? ingredientItemId);
        throw err;
      }
    }

    await this.eventBus.publish(
      new OrderRegisteredEvent(
        order.id,
        order.branchId,
        order.total,
        command.createdBy ?? null,
        order.paymentMethodId,
        Math.round(costOfGoodsSold * 100) / 100,
        costIncomplete
      )
    );

    return order;
  }

  private async resolveCustomerContact(command: RegisterOrderCommand) {
    if (!command.customerId) return {};
    const customer = await this.customers.findById(command.customerId);
    if (!customer) throw new CustomerNotFoundForOrderError();
    const contact = customer.orderContact({ phone: command.customerPhone, addressId: command.customerAddressId });
    const addressDetails = contact.addressDetails ?? command.addressDetails ?? null;
    if (command.orderType === "delivery" && !addressDetails) throw new DeliveryAddressRequiredError();
    return {
      customerId: customer.id,
      customerName: contact.customerName ?? command.customerName ?? null,
      customerPhone: contact.customerPhone,
      addressDetails: command.orderType === "delivery" ? addressDetails : null,
    };
  }
}
