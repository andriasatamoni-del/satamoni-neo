import { Inject, Injectable } from "@nestjs/common";
import { RegisterOrderHandler } from "../../../orders/application/commands/register-order.handler";
import { InsufficientStockForOrderError } from "../../../orders/domain/errors";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../../branches/domain/ports/branch-repository.port";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../../customers/domain/ports/customer-repository.port";
import type { Customer } from "../../../customers/domain/customer.aggregate";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import { STOREFRONT_READER, type StorefrontReaderPort } from "../../domain/ports/storefront-reader.port";
import { normalizeOnlineOrder } from "../../domain/online-order";
import {
  CustomerBlockedForOnlineOrderError,
  InvalidOnlineOrderError,
  OnlineOrderBranchNotAvailableError,
  OnlineOrderingClosedError,
  OnlineOrderItemUnavailableError,
} from "../../domain/errors";

export interface PlaceOnlineOrderCommand {
  // عميل مسجّل دخول (اختياري) - رقم الطلب بيبقى رقم الحساب نفسه، ومينفعش يطلب برقم حد تاني
  customer: Customer | null;
  clientRequestId: string;
  branchId: string;
  orderType: string;
  customerName?: string;
  customerPhone?: string;
  customerPhone2?: string;
  addressDetails?: string;
  distinguishingMark?: string;
  tableNumber?: string;
  notes?: string;
  saveAddress?: boolean;
  items: { variantId?: string; comboId?: string; quantity: number; modifierIds?: string[] }[];
}

// طلب الموقع = نفس مسار الكاشير بالظبط (RegisterOrderHandler: أسعار من المنيو الحقيقي، استهلاك مخزون، قيد
// محاسبي، طباعة المطبخ، SMS التأكيد) بمصدر website ومن غير موظف (createdBy=null). الدفع كاش عند الاستلام:
// بيتقفل على أول طريقة دفع كاش نشطة (Payment Control) عشان الطيار/الكاشير يحاسَب عليه في الشيفت.
@Injectable()
export class PlaceOnlineOrderHandler {
  constructor(
    private readonly registerOrder: RegisterOrderHandler,
    private readonly settings: GetPosSettingsHandler,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort,
    @Inject(STOREFRONT_READER) private readonly reader: StorefrontReaderPort
  ) {}

  async execute(command: PlaceOnlineOrderCommand) {
    if (!(await this.settings.execute()).onlineOrderingEnabled) throw new OnlineOrderingClosedError();

    const branch = await this.branches.findById(command.branchId);
    if (!branch || branch.isCentralKitchen) throw new OnlineOrderBranchNotAvailableError();

    const normalized = normalizeOnlineOrder({
      branch: { id: branch.id, supportsDineIn: branch.supportsDineIn },
      orderType: command.orderType,
      customerName: command.customerName?.trim() || command.customer?.name,
      customerPhone: command.customer?.phone ?? command.customerPhone,
      customerPhone2: command.customerPhone2,
      addressDetails: command.addressDetails,
      distinguishingMark: command.distinguishingMark,
      tableNumber: command.tableNumber,
      notes: command.notes,
      items: command.items,
    });

    const known = command.customer ?? (await this.customers.findByPhone(normalized.customerPhone));
    if (known?.isBlocked) throw new CustomerBlockedForOnlineOrderError();

    let order;
    try {
      order = await this.registerOrder.execute({
        ...normalized,
        source: "website",
        createdBy: null,
        paymentMethodId: await this.reader.cashPaymentMethodId(),
        clientRequestId: command.clientRequestId,
      });
    } catch (err) {
      if (err instanceof InsufficientStockForOrderError) throw new OnlineOrderItemUnavailableError();
      throw err;
    }
    // clientRequestId مطابق لطلب مش من الموقع (مستحيل عمليًا - UUID) - مانرجّعش بيانات طلب حد تاني
    if (order.source !== "website" || order.customerPhone !== normalized.customerPhone) {
      throw new InvalidOnlineOrderError("الطلب ده متسجّل قبل كده ببيانات مختلفة");
    }

    if (command.customer && command.saveAddress && normalized.orderType === "delivery" && command.addressDetails?.trim()) {
      const details = command.addressDetails.trim();
      const exists = command.customer.addresses.some((a) => a.addressDetails === details);
      if (!exists) {
        command.customer.addAddress({
          label: null,
          addressDetails: details,
          distinguishingMark: command.distinguishingMark?.trim() || null,
          isDefault: command.customer.addresses.length === 0,
        });
        await this.customers.save(command.customer);
      }
    }

    return { orderId: order.id, trackingToken: order.ratingToken, total: order.total, orderType: order.orderType };
  }
}
