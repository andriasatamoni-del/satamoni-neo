import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { groupBy, inListChunks, orderByOf, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";
import { customerAddresses, customers } from "../../infrastructure/persistence/customers.tables";

export interface CustomerListFilter {
  q?: string;
  blocked?: boolean;
  sort?: string;
  order?: "asc" | "desc";
}

const SORT_COLUMNS = {
  created_at: customers.created_at,
  name: customers.name,
  loyalty_points: customers.loyalty_points,
};

@Injectable()
export class ListCustomersHandler {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async execute(filter: CustomerListFilter, page: PageRequest) {
    const where = and(
      filter.blocked !== undefined ? eq(customers.is_blocked, filter.blocked) : undefined,
      searchCondition(filter.q, customers.name, customers.phone, customers.phone2, customers.email)
    );
    const query = this.db
      .select({
        id: customers.id,
        phone: customers.phone,
        phone2: customers.phone2,
        name: customers.name,
        email: customers.email,
        address_details: customers.address_details,
        distinguishing_mark: customers.distinguishing_mark,
        notes: customers.notes,
        loyalty_points: customers.loyalty_points,
        is_blocked: customers.is_blocked,
        block_reason: customers.block_reason,
        blocked_at: customers.blocked_at,
        created_at: customers.created_at,
        updated_at: customers.updated_at,
      })
      .from(customers)
      .where(where)
      .orderBy(...orderByOf(SORT_COLUMNS, filter.sort, filter.order, { key: "created_at", order: "desc" }, customers.id))
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(customers).where(where)));
    const firstAddresses = await this.firstAddressesOf(rows.map((row) => row.id));
    return { rows: rows.map((row) => ({ ...row, first_address: firstAddresses.get(row.id) ?? null })), total };
  }

  private async firstAddressesOf(customerIds: string[]) {
    const addresses = [];
    for (const ids of inListChunks(customerIds)) {
      addresses.push(
        ...(await this.db
          .select({
            id: customerAddresses.id,
            customer_id: customerAddresses.customer_id,
            label: customerAddresses.label,
            address_details: customerAddresses.address_details,
            distinguishing_mark: customerAddresses.distinguishing_mark,
            area: customerAddresses.area,
            street: customerAddresses.street,
            building: customerAddresses.building,
            floor: customerAddresses.floor,
            apartment: customerAddresses.apartment,
            is_default: customerAddresses.is_default,
          })
          .from(customerAddresses)
          .where(inArray(customerAddresses.customer_id, ids))
          .orderBy(desc(customerAddresses.is_default), asc(customerAddresses.created_at), asc(customerAddresses.id)))
      );
    }
    const byCustomer = groupBy(addresses, (address) => address.customer_id);
    return new Map([...byCustomer].map(([customerId, list]) => [customerId, list[0]]));
  }
}
