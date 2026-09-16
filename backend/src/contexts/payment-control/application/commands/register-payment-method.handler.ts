import { Inject, Injectable } from "@nestjs/common";
import { PaymentMethod } from "../../domain/payment-method.aggregate";
import { PAYMENT_METHOD_REPOSITORY, type PaymentMethodRepositoryPort } from "../../domain/ports/payment-method-repository.port";

export interface RegisterPaymentMethodCommand {
  name: string;
  kind: string;
  settlementChannel?: string | null;
}

@Injectable()
export class RegisterPaymentMethodHandler {
  constructor(@Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepositoryPort) {}

  async execute(command: RegisterPaymentMethodCommand): Promise<PaymentMethod> {
    const method = PaymentMethod.register(command);
    await this.methods.save(method);
    return method;
  }
}
