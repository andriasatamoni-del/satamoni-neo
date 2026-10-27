import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { Customer, type CustomerAddress, type StructuredAddressInput } from "../../domain/customer.aggregate";
import { CustomerNotFoundError } from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";

export interface AddCustomerAddressCommand extends StructuredAddressInput {
  customerId: string;
}

@Injectable()
export class AddCustomerAddressHandler {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: AddCustomerAddressCommand): Promise<{ customer: Customer; address: CustomerAddress }> {
    return this.tx.run(async () => {
      const customer = await this.customers.findById(command.customerId);
      if (!customer) throw new CustomerNotFoundError();

      const address = customer.addAddress(command);
      await this.customers.save(customer);
      return { customer, address };
    });
  }
}
