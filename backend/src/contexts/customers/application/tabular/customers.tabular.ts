import { Inject, Injectable } from "@nestjs/common";
import { rowCreated, rowUnchanged, rowUpdated, type TabularAdapter, type TabularRowOutcome } from "../../../../shared/tabular/tabular-adapter";
import { parsePhone } from "../../domain/customer.aggregate";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";
import { RegisterCustomerByStaffHandler } from "../commands/register-customer-by-staff.handler";
import { UpdateCustomerByStaffHandler } from "../commands/update-customer-by-staff.handler";
import { ListCustomersHandler, type CustomerListFilter } from "../queries/list-customers.handler";
import { CUSTOMER_SHEET, customerSheetRow, sheetAddressOf, sheetPhone, type CustomerSheetRow } from "./customer.sheet";

@Injectable()
export class CustomersTabular implements TabularAdapter<typeof CUSTOMER_SHEET, CustomerListFilter> {
  readonly sheet = CUSTOMER_SHEET;

  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort,
    private readonly listCustomers: ListCustomersHandler,
    private readonly registerCustomer: RegisterCustomerByStaffHandler,
    private readonly updateCustomer: UpdateCustomerByStaffHandler
  ) {}

  async exportRows(filter: CustomerListFilter): Promise<CustomerSheetRow[]> {
    const { rows } = await this.listCustomers.execute({ q: filter.q, blocked: filter.blocked, sort: "name", order: "asc" });
    return rows.map(customerSheetRow);
  }

  async importRow(sheetRow: CustomerSheetRow): Promise<TabularRowOutcome> {
    const row = { ...sheetRow, phone: sheetPhone(sheetRow.phone), phone2: sheetRow.phone2 ? sheetPhone(sheetRow.phone2) : null };
    const existing = await this.customers.findByPhone(parsePhone(row.phone));
    const address = sheetAddressOf(row);
    if (!existing) {
      const customer = await this.registerCustomer.execute({
        name: row.name,
        phone: row.phone,
        extraPhones: row.phone2 ? [{ phone: row.phone2 }] : undefined,
        addresses: address ? [address] : undefined,
      });
      if (row.notes) await this.updateCustomer.execute({ customerId: customer.id, notes: row.notes });
      return rowCreated(customer.id);
    }
    const { changed } = await this.updateCustomer.execute({
      customerId: existing.id,
      name: row.name,
      notes: row.notes ?? undefined,
      extraPhone: row.phone2 ?? undefined,
      address,
    });
    return changed ? rowUpdated(existing.id) : rowUnchanged(existing.id);
  }
}
