import { Inject, Injectable } from "@nestjs/common";
import { TALABAT_ORDER_REPOSITORY, type TalabatOrderRepositoryPort } from "../../domain/ports/talabat-order-repository.port";
import {
  TALABAT_INTEGRATION_ERROR_REPOSITORY,
  type TalabatIntegrationErrorRepositoryPort,
} from "../../domain/ports/talabat-integration-error-repository.port";

export interface TalabatDashboardSummary {
  // النظام مصمَّم بالكامل (webhook/مزامنة/إلغاء/مطابقة/لوحة) بس الاتصال الفعلي بـTalabat نفسه لسه
  // موقوف عمدًا لحد ما مواصفة Partner API الحقيقية تتوفر - نفس فلسفة docs/TALABAT-INTEGRATION.md
  // بالحرف: حالة اتصال صادقة، مش ادّعاء اتصال حقيقي مالحصلش
  connectionStatus: "NOT_CONFIGURED" | "CONFIGURED_UNVERIFIED";
  ordersToday: { total: number; imported: number; mappingError: number; failed: number; canceled: number };
  openIntegrationErrors: number;
}

@Injectable()
export class GetTalabatDashboardSummaryHandler {
  constructor(
    @Inject(TALABAT_ORDER_REPOSITORY) private readonly talabatOrders: TalabatOrderRepositoryPort,
    @Inject(TALABAT_INTEGRATION_ERROR_REPOSITORY) private readonly integrationErrors: TalabatIntegrationErrorRepositoryPort
  ) {}

  async execute(input: { branchId?: string; date?: Date }): Promise<TalabatDashboardSummary> {
    const day = input.date ?? new Date();
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);

    const todayOrders = await this.talabatOrders.list({ branchId: input.branchId, from, to });
    const openErrors = await this.integrationErrors.list({ status: "OPEN" });

    return {
      connectionStatus: process.env.TALABAT_CLIENT_ID && process.env.TALABAT_CLIENT_SECRET ? "CONFIGURED_UNVERIFIED" : "NOT_CONFIGURED",
      ordersToday: {
        total: todayOrders.length,
        imported: todayOrders.filter((o) => o.status === "IMPORTED").length,
        mappingError: todayOrders.filter((o) => o.status === "MAPPING_ERROR").length,
        failed: todayOrders.filter((o) => o.status === "FAILED").length,
        canceled: todayOrders.filter((o) => o.status === "CANCELED").length,
      },
      openIntegrationErrors: openErrors.length,
    };
  }
}
