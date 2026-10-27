import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { Customer, parsePhone, type StructuredAddressInput } from "../../domain/customer.aggregate";
import { CustomerPhoneTakenError } from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";

export interface RegisterCustomerByStaffCommand {
  name: string;
  phone: string;
  extraPhones?: { phone: string; label?: string | null }[];
  addresses?: StructuredAddressInput[];
}

@Injectable()
export class RegisterCustomerByStaffHandler {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: RegisterCustomerByStaffCommand): Promise<Customer> {
    return this.tx.run(async () => {
      const phone = parsePhone(command.phone);
      if (await this.customers.findByPhone(phone)) throw new CustomerPhoneTakenError();
      const customer = Customer.registerByStaff({ ...command, phone });
      await this.customers.save(customer);
      return customer;
    });
  }
}
