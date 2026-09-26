import { Inject, Injectable } from "@nestjs/common";
import { TalabatOrder } from "../../domain/talabat-order.aggregate";
import { TalabatIntegrationError } from "../../domain/talabat-integration-error.aggregate";
import { TALABAT_ORDER_REPOSITORY, type TalabatOrderRepositoryPort } from "../../domain/ports/talabat-order-repository.port";
import {
  TALABAT_PRODUCT_MAPPING_REPOSITORY,
  type TalabatProductMappingRepositoryPort,
} from "../../domain/ports/talabat-product-mapping-repository.port";
import {
  TALABAT_INTEGRATION_ERROR_REPOSITORY,
  type TalabatIntegrationErrorRepositoryPort,
} from "../../domain/ports/talabat-integration-error-repository.port";
import { TALABAT_SYSTEM_USER_EMAIL } from "../../domain/system-user";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../../branches/domain/ports/branch-repository.port";
import {
  PAYMENT_METHOD_REPOSITORY,
  type PaymentMethodRepositoryPort,
} from "../../../payment-control/domain/ports/payment-method-repository.port";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../../identity-access/domain/ports/user-repository.port";
import { RegisterOrderHandler } from "../../../orders/application/commands/register-order.handler";

export interface NormalizedTalabatOrderItem {
  talabatItemId: string;
  quantity: number;
}

// NormalizedTalabatOrder - الشكل الداخلي المُصمَّم مننا اللي كل الـpipeline مبني عليه (نفس فلسفة
// talabat-payload-adapter.js بالريبو القديم بالحرف: مش شكل حقول Talabat الحقيقي - ده لسه مش معروف
// (راجع docs/TALABAT-INTEGRATION.md قسم 8) - هيتحول لشكل ده لما مواصفة Talabat الحقيقية تتوفر، من
// غير ما باقي الـpipeline (SyncTalabatOrderHandler، CancelTalabatOrderHandler) يحتاج يتغيّر خالص.
export interface NormalizedTalabatOrder {
  talabatOrderId: string;
  talabatBranchId: string;
  talabatPaymentCode: string;
  customerName?: string | null;
  customerPhone?: string | null;
  addressDetails?: string | null;
  items: NormalizedTalabatOrderItem[];
  rawPayload: unknown;
}

export interface SyncTalabatOrderResult {
  talabatOrder: TalabatOrder;
}

// محرك المزامنة الأساسي - NormalizedTalabatOrder -> أوردر POS حقيقي عبر RegisterOrderHandler (نفس
// محرك الكاشير بالظبط، صفر منطق موازي - نفس فلسفة talabat-order-sync.js بالريبو القديم بالحرف). كل
// خطوة فشل (فرع/طريقة دفع/صنف مش مربوط) بتسجّل TalabatOrder بحالة MAPPING_ERROR + خطأ تكامل مرئي، مش
// تجاهل صامت - ومفيش أوردر جزئي أبدًا (كل الأصناف لازم تتربط الأول).
@Injectable()
export class SyncTalabatOrderHandler {
  constructor(
    @Inject(TALABAT_ORDER_REPOSITORY) private readonly talabatOrders: TalabatOrderRepositoryPort,
    @Inject(TALABAT_PRODUCT_MAPPING_REPOSITORY) private readonly productMappings: TalabatProductMappingRepositoryPort,
    @Inject(TALABAT_INTEGRATION_ERROR_REPOSITORY) private readonly integrationErrors: TalabatIntegrationErrorRepositoryPort,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly paymentMethods: PaymentMethodRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly registerOrder: RegisterOrderHandler
  ) {}

  async execute(input: NormalizedTalabatOrder): Promise<SyncTalabatOrderResult> {
    // idempotent فعليًا على success/cancel بس - MAPPING_ERROR/FAILED قابلة لإعادة المحاولة (نفس الصف
    // بيتحدّث مش يتكرر) عبر RetryIntegrationErrorHandler، بيعيد استدعاء execute() بنفس الـpayload
    const existing = await this.talabatOrders.findByTalabatOrderId(input.talabatOrderId);
    if (existing && (existing.status === "IMPORTED" || existing.status === "CANCELED")) {
      return { talabatOrder: existing };
    }

    const talabatOrder = existing ?? TalabatOrder.receive({ talabatOrderId: input.talabatOrderId, rawPayload: input.rawPayload });

    const branch = await this.branches.findByTalabatBranchId(input.talabatBranchId);
    if (!branch) {
      return this.fail(talabatOrder, null, "SYNC", "BRANCH_UNMAPPED", { talabatBranchId: input.talabatBranchId });
    }

    const paymentMethod = await this.paymentMethods.findByTalabatPaymentCode(input.talabatPaymentCode);
    if (!paymentMethod) {
      return this.fail(talabatOrder, branch.id, "SYNC", "PAYMENT_METHOD_UNMAPPED", { talabatPaymentCode: input.talabatPaymentCode });
    }

    const resolvedItems: { variantId: string; quantity: number }[] = [];
    for (const item of input.items) {
      const mapping = await this.productMappings.findByBranchAndTalabatItemId(branch.id, item.talabatItemId);
      if (!mapping || !mapping.variantId) {
        return this.fail(talabatOrder, branch.id, "SYNC", "MAPPING_ERROR", { talabatItemId: item.talabatItemId });
      }
      resolvedItems.push({ variantId: mapping.variantId, quantity: item.quantity });
    }

    const systemUser = await this.users.findByEmail(TALABAT_SYSTEM_USER_EMAIL);

    try {
      const order = await this.registerOrder.execute({
        branchId: branch.id,
        orderType: "delivery",
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        addressDetails: input.addressDetails ?? null,
        items: resolvedItems,
        paymentMethodId: paymentMethod.id,
        createdBy: systemUser?.id ?? null,
      });
      talabatOrder.markImported({ branchId: branch.id, posOrderId: order.id });
      await this.talabatOrders.save(talabatOrder);
      return { talabatOrder };
    } catch (err) {
      return this.fail(talabatOrder, branch.id, "SYNC", "TALABAT_ORDER_FAILED", { message: (err as Error).message }, true);
    }
  }

  private async fail(
    talabatOrder: TalabatOrder,
    branchId: string | null,
    stage: "SYNC",
    reason: string,
    context: unknown,
    isFailure = false
  ): Promise<SyncTalabatOrderResult> {
    if (isFailure) talabatOrder.markFailed({ branchId: branchId!, reason });
    else talabatOrder.markMappingError({ branchId, reason });
    await this.talabatOrders.save(talabatOrder);

    const error = TalabatIntegrationError.register({
      stage,
      talabatOrderId: talabatOrder.talabatOrderId,
      message: reason,
      context,
    });
    await this.integrationErrors.save(error);

    return { talabatOrder };
  }
}
