import { Inject, Injectable } from "@nestjs/common";
import { Customer, type CustomerAddress } from "../../domain/customer.aggregate";
import { CustomerNotFoundError } from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";

export interface AddCustomerAddressCommand {
  customerId: string;
  label?: string | null;
  addressDetails: string;
  distinguishingMark?: string | null;
  isDefault?: boolean;
}

// دفتر عناوين العميل - في الريبو القديم بيتراكم تلقائيًا مع كل طلب دليفري (routes/orders.js)، ده مؤجّل
// هنا لحد ما مسار طلب عام يتضاف لـneo (راجع تعليق customer.aggregate.ts) - العميل لحد كده بيضيف عناوينه
// يدوي من بوابته الذاتية
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
