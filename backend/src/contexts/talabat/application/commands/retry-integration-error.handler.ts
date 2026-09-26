import { Inject, Injectable } from "@nestjs/common";
import { TalabatIntegrationError } from "../../domain/talabat-integration-error.aggregate";
import {
  TALABAT_INTEGRATION_ERROR_REPOSITORY,
  type TalabatIntegrationErrorRepositoryPort,
} from "../../domain/ports/talabat-integration-error-repository.port";
import { TALABAT_ORDER_REPOSITORY, type TalabatOrderRepositoryPort } from "../../domain/ports/talabat-order-repository.port";
import { IntegrationErrorNotFoundError, TalabatOrderNotFoundError } from "../../domain/errors";
import { SyncTalabatOrderHandler } from "./sync-talabat-order.handler";
import type { TalabatWebhookPayload } from "./receive-talabat-webhook.handler";

export interface RetryIntegrationErrorCommand {
  integrationErrorId: string;
}

// إعادة محاولة - بس لأخطاء SYNC (مش WEBHOOK ولا CANCELLATION - دول مش قابلين لإعادة نفس المحاولة).
// بيعيد بناء NormalizedTalabatOrder من raw_payload المحفوظ على صف التتبّع نفسه، وينادي محرك المزامنة
// تاني (idempotent فعليًا على MAPPING_ERROR/FAILED - راجع تعليق SyncTalabatOrderHandler.execute).
@Injectable()
export class RetryIntegrationErrorHandler {
  constructor(
    @Inject(TALABAT_INTEGRATION_ERROR_REPOSITORY) private readonly integrationErrors: TalabatIntegrationErrorRepositoryPort,
    @Inject(TALABAT_ORDER_REPOSITORY) private readonly talabatOrders: TalabatOrderRepositoryPort,
    private readonly syncTalabatOrder: SyncTalabatOrderHandler
  ) {}

  async execute(command: RetryIntegrationErrorCommand): Promise<TalabatIntegrationError> {
    const error = await this.integrationErrors.findById(command.integrationErrorId);
    if (!error) throw new IntegrationErrorNotFoundError();

    error.markRetrying();
    await this.integrationErrors.save(error);

    if (error.stage !== "SYNC" || !error.talabatOrderId) return error;

    const talabatOrder = await this.talabatOrders.findByTalabatOrderId(error.talabatOrderId);
    if (!talabatOrder) throw new TalabatOrderNotFoundError();

    const payload = talabatOrder.rawPayload as TalabatWebhookPayload;
    const { talabatOrder: updated } = await this.syncTalabatOrder.execute({
      talabatOrderId: payload.talabatOrderId,
      talabatBranchId: payload.talabatBranchId ?? "",
      talabatPaymentCode: payload.talabatPaymentCode ?? "",
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      addressDetails: payload.addressDetails,
      items: payload.items ?? [],
      rawPayload: payload,
    });

    if (updated.status === "IMPORTED") error.resolve();
    else error.reopen(updated.errorReason ?? error.message);
    await this.integrationErrors.save(error);

    return error;
  }
}
