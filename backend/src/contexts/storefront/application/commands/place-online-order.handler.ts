import { Inject, Injectable } from "@nestjs/common";
import { RegisterOrderHandler } from "../../../orders/application/commands/register-order.handler";
import { InsufficientStockForOrderError } from "../../../orders/domain/errors";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../../orders/domain/ports/order-repository.port";
import type { Order } from "../../../orders/domain/order.aggregate";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../../branches/domain/ports/branch-repository.port";
import type { Customer } from "../../../customers/domain/customer.aggregate";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import { LoyaltyRedemptionService, type PreparedRedemption } from "../../../loyalty/application/services/loyalty-redemption.service";
import { STOREFRONT_READER, type StorefrontReaderPort } from "../../domain/ports/storefront-reader.port";
import { normalizeOnlineOrder } from "../../domain/online-order";
import {
  CustomerBlockedForOnlineOrderError,
  IncompleteCustomerProfileError,
  InvalidOnlineOrderError,
  OnlineOrderBranchNotAvailableError,
  OnlineOrderingClosedError,
  OnlineOrderItemUnavailableError,
} from "../../domain/errors";

export interface PlaceOnlineOrderCommand {
  customer: Customer;
  clientRequestId: string;
  branchId: string;
  orderType: string;
  addressId?: string;
  tableNumber?: string;
  notes?: string;
  rewardId?: string;
  items: { variantId?: string; comboId?: string; quantity: number; modifierIds?: string[] }[];
}

@Injectable()
export class PlaceOnlineOrderHandler {
  constructor(
    private readonly registerOrder: RegisterOrderHandler,
    private readonly settings: GetPosSettingsHandler,
    private readonly redemption: LoyaltyRedemptionService,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort,
    @Inject(STOREFRONT_READER) private readonly reader: StorefrontReaderPort
  ) {}

  async execute(command: PlaceOnlineOrderCommand) {
    const { customer } = command;
    const previous = await this.orders.findByClientRequestId(command.clientRequestId);
    if (previous) return this.result(previous, customer);

    if (!(await this.settings.execute()).onlineOrderingEnabled) throw new OnlineOrderingClosedError();
    if (customer.isBlocked) throw new CustomerBlockedForOnlineOrderError();
    if (customer.missingProfileFields.length > 0) throw new IncompleteCustomerProfileError();

    const branch = await this.branches.findById(command.branchId);
    if (!branch || branch.isCentralKitchen) throw new OnlineOrderBranchNotAvailableError();

    const address = command.orderType === "delivery" ? customer.findAddress(command.addressId ?? "") : undefined;
    if (command.orderType === "delivery" && !address) throw new InvalidOnlineOrderError("اختار عنوان التوصيل من عناوينك");

    const normalized = normalizeOnlineOrder({
      branch: { id: branch.id, supportsDineIn: branch.supportsDineIn },
      orderType: command.orderType,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerPhone2: customer.phone2,
      addressDetails: address?.addressDetails,
      distinguishingMark: address?.distinguishingMark,
      tableNumber: command.tableNumber,
      notes: command.notes,
      items: command.items,
    });

    let redemption: PreparedRedemption | null = null;
    if (command.rewardId) {
      redemption = await this.redemption.prepare(customer.id, command.rewardId);
      if (redemption.giftLine) normalized.items.push(redemption.giftLine);
      normalized.customerNotes = [`🎁 مكافأة نقاط: ${redemption.rewardName}`, normalized.customerNotes].filter(Boolean).join(" - ");
      await this.redemption.reserve(customer.id, command.clientRequestId, redemption);
    }

    let order: Order;
    try {
      order = await this.registerOrder.execute({
        ...normalized,
        customerId: customer.id,
        discount: redemption?.discount ?? 0,
        source: "website",
        createdBy: null,
        paymentMethodId: await this.reader.cashPaymentMethodId(),
        clientRequestId: command.clientRequestId,
      });
    } catch (err) {
      if (redemption) await this.redemption.release(command.clientRequestId);
      if (err instanceof InsufficientStockForOrderError) throw new OnlineOrderItemUnavailableError();
      throw err;
    }
    if (redemption) await this.redemption.attach(command.clientRequestId, order.id);
    return this.result(order, customer);
  }

  private result(order: Order, customer: Customer) {
    if (order.source !== "website" || order.customerPhone !== customer.phone) {
      throw new InvalidOnlineOrderError("الطلب ده متسجّل قبل كده ببيانات مختلفة");
    }
    return { orderId: order.id, trackingToken: order.ratingToken, total: order.total, discount: order.discount, orderType: order.orderType };
  }
}
