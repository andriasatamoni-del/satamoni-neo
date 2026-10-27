import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import type { Customer } from "../../domain/customer.aggregate";
import { CustomerNotFoundError } from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";

export interface AddCustomerPhoneCommand {
  customerId: string;
  phone: string;
  label?: string | null;
}

@Injectable()
export class AddCustomerPhoneHandler {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: AddCustomerPhoneCommand): Promise<Customer> {
    return this.tx.run(async () => {
      const customer = await this.customers.findById(command.customerId);
      if (!customer) throw new CustomerNotFoundError();
      customer.addPhone(command);
      await this.customers.save(customer);
      return customer;
    });
  }
}
