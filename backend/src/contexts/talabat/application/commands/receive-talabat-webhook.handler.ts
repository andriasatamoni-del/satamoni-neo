import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  TALABAT_WEBHOOK_EVENT_REPOSITORY,
  type TalabatWebhookEventRepositoryPort,
} from "../../domain/ports/talabat-webhook-event-repository.port";
import { TalabatIntegrationError } from "../../domain/talabat-integration-error.aggregate";
import {
  TALABAT_INTEGRATION_ERROR_REPOSITORY,
  type TalabatIntegrationErrorRepositoryPort,
} from "../../domain/ports/talabat-integration-error-repository.port";
import { TalabatWebhookAuthService } from "../../infrastructure/security/talabat-webhook-auth.service";
import { InvalidWebhookSignatureError } from "../../domain/errors";
import { SyncTalabatOrderHandler, type NormalizedTalabatOrderItem } from "./sync-talabat-order.handler";
import { CancelTalabatOrderHandler } from "./cancel-talabat-order.handler";

// شكل جسم الـwebhook - عقد داخلي مُصمَّم مننا لحد ما مواصفة Talabat Partner API الحقيقية تتوفر (راجع
// docs/TALABAT-INTEGRATION.md قسم 8 وتعليق NormalizedTalabatOrder) - نفس فلسفة talabat-payload-adapter.js
// STUB بالريبو القديم بالحرف: مفيش تخمين لشكل حقول Talabat الحقيقي.
export interface TalabatWebhookPayload {
  talabatOrderId: string;
  status: "CREATED" | "CANCELED";
  talabatBranchId?: string;
  talabatPaymentCode?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  addressDetails?: string | null;
  items?: NormalizedTalabatOrderItem[];
}

export interface ReceiveTalabatWebhookCommand {
  rawBody: string;
  signatureHeader: string | undefined;
}

export interface ReceiveTalabatWebhookResult {
  duplicate: boolean;
}

// الاستقبال الفعلي - توقيع (fail-closed) -> dedupe (sha256 الجسم الخام، ON CONFLICT DO NOTHING) ->
// توجيه لمحرك المزامنة أو الإلغاء حسب status - نفس تدفق docs/TALABAT-INTEGRATION.md قسم 4 بالحرف.
@Injectable()
export class ReceiveTalabatWebhookHandler {
  constructor(
    @Inject(TALABAT_WEBHOOK_EVENT_REPOSITORY) private readonly webhookEvents: TalabatWebhookEventRepositoryPort,
    @Inject(TALABAT_INTEGRATION_ERROR_REPOSITORY) private readonly integrationErrors: TalabatIntegrationErrorRepositoryPort,
    private readonly webhookAuth: TalabatWebhookAuthService,
    private readonly syncTalabatOrder: SyncTalabatOrderHandler,
    private readonly cancelTalabatOrder: CancelTalabatOrderHandler
  ) {}

  async execute(command: ReceiveTalabatWebhookCommand): Promise<ReceiveTalabatWebhookResult> {
    if (!this.webhookAuth.verify(command.rawBody, command.signatureHeader)) {
      throw new InvalidWebhookSignatureError();
    }

    const dedupeKey = createHash("sha256").update(command.rawBody, "utf8").digest("hex");
    const parsed: unknown = JSON.parse(command.rawBody);
    const isNew = await this.webhookEvents.recordIfNew(dedupeKey, parsed);
    if (!isNew) return { duplicate: true };

    const payload = parsed as TalabatWebhookPayload;

    if (payload.status === "CANCELED") {
      await this.cancelTalabatOrder.execute({ talabatOrderId: payload.talabatOrderId });
      return { duplicate: false };
    }

    if (payload.status === "CREATED") {
      await this.syncTalabatOrder.execute({
        talabatOrderId: payload.talabatOrderId,
        talabatBranchId: payload.talabatBranchId ?? "",
        talabatPaymentCode: payload.talabatPaymentCode ?? "",
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        addressDetails: payload.addressDetails,
        items: payload.items ?? [],
        rawPayload: parsed,
      });
      return { duplicate: false };
    }

    const error = TalabatIntegrationError.register({
      stage: "WEBHOOK",
      talabatOrderId: payload.talabatOrderId ?? null,
      message: `حالة webhook غير معروفة: ${payload.status}`,
      context: parsed,
    });
    await this.integrationErrors.save(error);
    return { duplicate: false };
  }
}
