import { Inject, Injectable } from "@nestjs/common";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../../orders/domain/ports/order-repository.port";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../../branches/domain/ports/branch-repository.port";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../../catalog/domain/ports/menu-item-repository.port";
import { MENU_CATEGORY_REPOSITORY, type MenuCategoryRepositoryPort } from "../../../catalog/domain/ports/menu-category-repository.port";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../../catalog/domain/ports/combo-repository.port";
import { PAYMENT_METHOD_REPOSITORY, type PaymentMethodRepositoryPort } from "../../../payment-control/domain/ports/payment-method-repository.port";
import type { Order } from "../../../orders/domain/order.aggregate";
import type { PrintOrderSummary, PrintItemLine } from "../../infrastructure/print-templates";

export const ORDER_TYPE_LABELS: Record<string, string> = { dinein: "صالة", takeaway: "تيك أواي", delivery: "دليفري" };

export interface ResolvedPrintItem extends PrintItemLine {
  stationId: string | null;
}

export interface OrderPrintData {
  order: Order;
  summary: PrintOrderSummary;
  items: ResolvedPrintItem[];
}

@Injectable()
export class OrderPrintDataBuilder {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort,
    @Inject(MENU_ITEM_REPOSITORY) private readonly menuItems: MenuItemRepositoryPort,
    @Inject(MENU_CATEGORY_REPOSITORY) private readonly menuCategories: MenuCategoryRepositoryPort,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly paymentMethods: PaymentMethodRepositoryPort,
    @Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort
  ) {}

  async build(orderId: string): Promise<OrderPrintData | null> {
    const order = await this.orders.findById(orderId);
    if (!order) return null;

    const branch = await this.branches.findById(order.branchId);
    const paymentMethod = order.paymentMethodId ? await this.paymentMethods.findById(order.paymentMethodId) : null;

    const items: ResolvedPrintItem[] = [];
    for (const line of order.topLevelItems) {
      if (line.comboId) {
        const combo = await this.combos.findById(line.comboId);
        const components = combo?.mainItems ?? [];
        for (const [index, component] of components.entries()) {
          const menuItem = await this.menuItems.findByVariantId(component.variantId);
          const variant = menuItem?.variants.find((v) => v.id === component.variantId);
          let stationId = menuItem?.stationId ?? null;
          if (!stationId && menuItem?.categoryId) {
            const category = await this.menuCategories.findById(menuItem.categoryId);
            stationId = category?.stationId ?? null;
          }
          items.push({
            name: `${combo?.name ?? "عرض"}: ${menuItem?.name ?? "صنف"}`,
            variantLabel: variant?.label ?? null,
            quantity: component.quantity * line.quantity,
            unitPrice: index === 0 ? line.unitPrice : 0,
            lineTotal: index === 0 ? line.lineTotal : 0,
            stationId,
          });
          for (const addon of combo?.addonsOf(component.id) ?? []) {
            const addonItem = await this.menuItems.findByVariantId(addon.variantId);
            items.push({
              name: `+ ${addonItem?.name ?? "إضافة"}`,
              variantLabel: null,
              quantity: addon.quantity * component.quantity * line.quantity,
              unitPrice: 0,
              lineTotal: 0,
              stationId,
            });
          }
        }
        continue;
      }

      const menuItem = await this.menuItems.findByVariantId(line.variantId!);
      const variant = menuItem?.variants.find((v) => v.id === line.variantId);
      let stationId = menuItem?.stationId ?? null;
      if (!stationId && menuItem?.categoryId) {
        const category = await this.menuCategories.findById(menuItem.categoryId);
        stationId = category?.stationId ?? null;
      }
      items.push({
        name: `${menuItem?.name ?? "صنف"}${line.withoutIngredients.length > 0 ? ` (بدون ${line.withoutIngredients.map((ingredient) => ingredient.name).join("، ")})` : ""}`,
        variantLabel: variant?.label ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        stationId,
      });
      for (const addon of order.addonsOf(line.id)) {
        const addonItem = await this.menuItems.findByVariantId(addon.variantId!);
        items.push({
          name: `+ ${addonItem?.name ?? "إضافة"}`,
          variantLabel: null,
          quantity: addon.quantity,
          unitPrice: addon.unitPrice,
          lineTotal: addon.lineTotal,
          stationId,
        });
      }
    }

    const summary: PrintOrderSummary = {
      orderId: order.id,
      branchLabel: branch?.name ?? "",
      orderTypeLabel: ORDER_TYPE_LABELS[order.orderType] ?? order.orderType,
      createdAt: order.createdAt,
      paymentMethodLabel: paymentMethod?.name ?? null,
      subtotal: order.subtotal,
      discount: order.discount,
      total: order.total,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      addressDetails: order.addressDetails,
    };

    return { order, summary, items };
  }
}

export function splitItemsByStation(items: ResolvedPrintItem[]): Map<string | null, PrintItemLine[]> {
  const buckets = new Map<string | null, PrintItemLine[]>();
  for (const item of items) {
    const key = item.stationId;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  return buckets;
}
