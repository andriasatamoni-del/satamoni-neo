import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { Payment } from "../../domain/payment.aggregate";
import { PAYMENT_REPOSITORY, type PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";

@Injectable()
export class ListPaymentsHandler {
  constructor(@Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort) {}

  async execute(filter?: { branchId?: string; settlementChannel?: string }, page?: PageRequest): Promise<{ rows: Payment[]; total: number }> {
    return this.payments.listPage(filter, page);
  }
}
