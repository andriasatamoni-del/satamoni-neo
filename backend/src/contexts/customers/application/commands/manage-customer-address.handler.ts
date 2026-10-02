import { Inject, Injectable } from "@nestjs/common";
import type { Customer } from "../../domain/customer.aggregate";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";

// حذف عنوان / تخليته الافتراضي - الطلبات القديمة مش بتتأثر (الطلب شايل نص العنوان وقت تسجيله)
@Injectable()
export class ManageCustomerAddressHandler {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort) {}

  async remove(customer: Customer, addressId: string): Promise<Customer> {
    customer.removeAddress(addressId);
    await this.customers.save(customer);
    return customer;
  }

  async makeDefault(customer: Customer, addressId: string): Promise<Customer> {
    customer.setDefaultAddress(addressId);
    await this.customers.save(customer);
    return customer;
  }
}
