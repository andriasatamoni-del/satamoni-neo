import { Inject, Injectable } from "@nestjs/common";
import { Customer, type CustomerAddress, type StructuredAddressInput } from "../../domain/customer.aggregate";
import { CustomerNotFoundError } from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";

export interface AddCustomerAddressCommand extends StructuredAddressInput {
  customerId: string;
}

// دفتر عناوين العميل - العميل بيضيف عناوينه من "حسابي" أو من صفحة الطلب، وبيختار منهم وقت الطلب
@Injectable()
export class AddCustomerAddressHandler {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort) {}

  async execute(command: AddCustomerAddressCommand): Promise<{ customer: Customer; address: CustomerAddress }> {
    const customer = await this.customers.findById(command.customerId);
    if (!customer) throw new CustomerNotFoundError();

    const address = customer.addAddress(command);
    await this.customers.save(customer);
    return { customer, address };
  }
}
