import { Inject, Injectable } from "@nestjs/common";
import { Payment } from "../../domain/payment.aggregate";
import { PAYMENT_REPOSITORY, type PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";

@Injectable()
export class ListPaymentsHandler {
  constructor(@Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort) {}

  async execute(filter?: { branchId?: string; settlementChannel?: string }): Promise<Payment[]> {
    return this.payments.list(filter);
  }
}
