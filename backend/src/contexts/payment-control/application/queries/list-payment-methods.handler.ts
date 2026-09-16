import { Inject, Injectable } from "@nestjs/common";
import { PaymentMethod } from "../../domain/payment-method.aggregate";
import { PAYMENT_METHOD_REPOSITORY, type PaymentMethodRepositoryPort } from "../../domain/ports/payment-method-repository.port";

@Injectable()
export class ListPaymentMethodsHandler {
  constructor(@Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepositoryPort) {}

  async execute(): Promise<PaymentMethod[]> {
    return this.methods.list();
  }
}
