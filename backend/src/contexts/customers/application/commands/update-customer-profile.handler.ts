import { Inject, Injectable } from "@nestjs/common";
import { normalizeEmail, type Customer } from "../../domain/customer.aggregate";
import { EmailAlreadyUsedError } from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";

// الاسم/الإيميل/الرقم التاني من "حسابي" - رقم الدخول نفسه (phone) مابيتغيّرش من هنا
@Injectable()
export class UpdateCustomerProfileHandler {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort) {}

  async execute(customer: Customer, input: { name?: string; email?: string; phone2?: string }): Promise<Customer> {
    if (input.email !== undefined) {
      const owner = await this.customers.findByEmail(normalizeEmail(input.email));
      if (owner && owner.id !== customer.id) throw new EmailAlreadyUsedError();
    }
    customer.updateContact(input);
    await this.customers.save(customer);
    return customer;
  }
}
