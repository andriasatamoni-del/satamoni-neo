import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { normalizePhone, type Customer, type StructuredAddressInput } from "../../domain/customer.aggregate";
import { CustomerNotFoundError } from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";

export interface UpdateCustomerByStaffCommand {
  customerId: string;
  name?: string;
  notes?: string;
  extraPhone?: string;
  address?: StructuredAddressInput;
}

@Injectable()
export class UpdateCustomerByStaffHandler {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: UpdateCustomerByStaffCommand): Promise<{ customer: Customer; changed: boolean }> {
    return this.tx.run(async () => {
      const customer = await this.customers.findById(command.customerId);
      if (!customer) throw new CustomerNotFoundError();

      let changed = false;
      if (command.name !== undefined && command.name.trim() !== customer.name) {
        customer.updateProfile({ name: command.name });
        changed = true;
      }
      const notes = command.notes?.trim();
      if (notes && notes !== customer.notes) {
        customer.updateProfile({ notes });
        changed = true;
      }
      if (command.extraPhone && !customer.hasPhone(normalizePhone(command.extraPhone))) {
        customer.addPhone({ phone: command.extraPhone });
        changed = true;
      }
      if (command.address && !customer.hasAddressAt(command.address)) {
        customer.addAddress(command.address);
        changed = true;
      }
      if (changed) await this.customers.save(customer);
      return { customer, changed };
    });
  }
}
