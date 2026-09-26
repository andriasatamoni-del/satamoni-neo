import { Inject, Injectable } from "@nestjs/common";
import { PaymentMethod } from "../../domain/payment-method.aggregate";
import { PAYMENT_METHOD_REPOSITORY, type PaymentMethodRepositoryPort } from "../../domain/ports/payment-method-repository.port";
import { PaymentMethodNotFoundError } from "../../domain/errors";

export interface LinkTalabatPaymentCodeCommand {
  paymentMethodId: string;
  talabatPaymentCode: string | null;
}

@Injectable()
export class LinkTalabatPaymentCodeHandler {
  constructor(@Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepositoryPort) {}

  async execute(command: LinkTalabatPaymentCodeCommand): Promise<PaymentMethod> {
    const method = await this.methods.findById(command.paymentMethodId);
    if (!method) throw new PaymentMethodNotFoundError();

    method.linkTalabatCode(command.talabatPaymentCode);
    await this.methods.save(method);
    return method;
  }
}
