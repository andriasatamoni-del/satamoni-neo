import { Inject, Injectable } from "@nestjs/common";
import { TalabatOrder } from "../../domain/talabat-order.aggregate";
import { TalabatIntegrationError } from "../../domain/talabat-integration-error.aggregate";
import { TALABAT_ORDER_REPOSITORY, type TalabatOrderRepositoryPort } from "../../domain/ports/talabat-order-repository.port";
import {
  TALABAT_INTEGRATION_ERROR_REPOSITORY,
  type TalabatIntegrationErrorRepositoryPort,
} from "../../domain/ports/talabat-integration-error-repository.port";
import { TALABAT_SYSTEM_USER_EMAIL } from "../../domain/system-user";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../../identity-access/domain/ports/user-repository.port";
import { CancelOrderHandler } from "../../../orders/application/commands/cancel-order.handler";

export interface CancelTalabatOrderCommand {
  talabatOrderId: string;
}

// إلغاء Talabat -> نفس مسار الاسترجاع الوحيد في النظام (CancelOrderHandler - عكس مخزون + قيد محاسبي)
// لو الأوردر ده كان اتسجّل فعليًا كأوردر POS، أو تحديث صف التتبّع بس لو كان لسه MAPPING_ERROR. إلغاء
// لأوردر مش متتبّع خالص = ORPHAN_CANCELLATION مرئي (نفس فلسفة talabat-cancellation.js بالحرف).
@Injectable()
export class CancelTalabatOrderHandler {
  constructor(
    @Inject(TALABAT_ORDER_REPOSITORY) private readonly talabatOrders: TalabatOrderRepositoryPort,
    @Inject(TALABAT_INTEGRATION_ERROR_REPOSITORY) private readonly integrationErrors: TalabatIntegrationErrorRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly cancelOrder: CancelOrderHandler
  ) {}

  async execute(command: CancelTalabatOrderCommand): Promise<TalabatOrder | null> {
    const talabatOrder = await this.talabatOrders.findByTalabatOrderId(command.talabatOrderId);
    if (!talabatOrder) {
      const error = TalabatIntegrationError.register({
        stage: "CANCELLATION",
        talabatOrderId: command.talabatOrderId,
        message: "ORPHAN_CANCELLATION",
      });
      await this.integrationErrors.save(error);
      return null;
    }

    if (talabatOrder.status === "CANCELED") return talabatOrder;

    if (talabatOrder.posOrderId) {
      const systemUser = await this.users.findByEmail(TALABAT_SYSTEM_USER_EMAIL);
      try {
        await this.cancelOrder.execute({ orderId: talabatOrder.posOrderId, cancelledBy: systemUser?.id ?? null });
      } catch (err) {
        const error = TalabatIntegrationError.register({
          stage: "CANCELLATION",
          talabatOrderId: talabatOrder.talabatOrderId,
          message: (err as Error).message,
        });
        await this.integrationErrors.save(error);
        return talabatOrder;
      }
    }

    talabatOrder.cancel("TALABAT");
    await this.talabatOrders.save(talabatOrder);
    return talabatOrder;
  }
}
