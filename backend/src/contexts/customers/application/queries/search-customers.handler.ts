import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, exists, ilike, or } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { escapeLike } from "../../../../shared/database/pagination";
import type { Customer } from "../../domain/customer.aggregate";
import { normalizePhone } from "../../domain/customer.aggregate";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";
import { customerPhones, customers } from "../../infrastructure/persistence/customers.tables";

const MAX_RESULTS = 10;
const PHONE_LIKE_RE = /^[\d\s+-]+$/;

@Injectable()
export class SearchCustomersHandler {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort
  ) {}

  async execute(q: string): Promise<Customer[]> {
    const term = q.trim();
    const matches = PHONE_LIKE_RE.test(term) ? this.phoneMatches(normalizePhone(term)) : this.nameOrPhoneMatches(term);
    const rows = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(matches)
      .orderBy(asc(customers.name), asc(customers.id))
      .limit(MAX_RESULTS);
    const found = await Promise.all(rows.map((row) => this.customers.findById(row.id)));
    return found.filter((customer): customer is Customer => customer !== null);
  }

  private phoneMatches(phone: string) {
    const pattern = `%${escapeLike(phone)}%`;
    return or(
      ilike(customers.phone, pattern),
      ilike(customers.phone2, pattern),
      exists(
        this.db
          .select({ id: customerPhones.id })
          .from(customerPhones)
          .where(and(eq(customerPhones.customer_id, customers.id), ilike(customerPhones.phone, pattern)))
      )
    );
  }

  private nameOrPhoneMatches(term: string) {
    return or(ilike(customers.name, `%${escapeLike(term)}%`), this.phoneMatches(term));
  }
}
