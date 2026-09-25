import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Customer } from "../../domain/customer.aggregate";
import type { CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";
import type { CustomerAddressesTable, CustomersTable } from "./customer.schema";

@Injectable()
export class KyselyCustomerRepository implements CustomerRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(customer: Customer): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("customers")
        .values({
          id: customer.id,
          phone: customer.phone,
          phone2: customer.phone2,
          name: customer.name,
          address_details: customer.addressDetails,
          distinguishing_mark: customer.distinguishingMark,
          notes: customer.notes,
          loyalty_points: customer.loyaltyPoints,
          password_hash: customer.passwordHash,
          is_blocked: customer.isBlocked,
          block_reason: customer.blockReason,
          blocked_by: customer.blockedBy,
          blocked_at: customer.blockedAt,
          legacy_customer_id: customer.legacyCustomerId,
          created_at: customer.createdAt,
          updated_at: customer.updatedAt,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            phone2: customer.phone2,
            name: customer.name,
            address_details: customer.addressDetails,
            distinguishing_mark: customer.distinguishingMark,
            notes: customer.notes,
            loyalty_points: customer.loyaltyPoints,
            password_hash: customer.passwordHash,
            is_blocked: customer.isBlocked,
            block_reason: customer.blockReason,
            blocked_by: customer.blockedBy,
            blocked_at: customer.blockedAt,
            updated_at: customer.updatedAt,
          })
        )
        .execute();

      await trx.deleteFrom("customer_addresses").where("customer_id", "=", customer.id).execute();
      for (const address of customer.addresses) {
        await trx
          .insertInto("customer_addresses")
          .values({
            id: address.id,
            customer_id: customer.id,
            label: address.label,
            address_details: address.addressDetails,
            distinguishing_mark: address.distinguishingMark,
            is_default: address.isDefault,
            created_at: address.createdAt,
          })
          .execute();
      }
    });
  }

  async findById(id: string): Promise<Customer | null> {
    const row = await this.db.selectFrom("customers").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row, await this.loadAddresses(id)) : null;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const row = await this.db.selectFrom("customers").selectAll().where("phone", "=", phone).executeTakeFirst();
    return row ? this.toDomain(row, await this.loadAddresses(row.id)) : null;
  }

  async findByLegacyCustomerId(legacyId: number): Promise<Customer | null> {
    const row = await this.db.selectFrom("customers").selectAll().where("legacy_customer_id", "=", legacyId).executeTakeFirst();
    return row ? this.toDomain(row, await this.loadAddresses(row.id)) : null;
  }

  private loadAddresses(customerId: string): Promise<Selectable<CustomerAddressesTable>[]> {
    return this.db.selectFrom("customer_addresses").selectAll().where("customer_id", "=", customerId).orderBy("created_at").execute();
  }

  private toDomain(row: Selectable<CustomersTable>, addressRows: Selectable<CustomerAddressesTable>[]): Customer {
    return Customer.reconstitute(row.id, {
      phone: row.phone,
      phone2: row.phone2,
      name: row.name,
      addressDetails: row.address_details,
      distinguishingMark: row.distinguishing_mark,
      notes: row.notes,
      loyaltyPoints: row.loyalty_points,
      passwordHash: row.password_hash,
      isBlocked: row.is_blocked,
      blockReason: row.block_reason,
      blockedBy: row.blocked_by,
      blockedAt: row.blocked_at,
      addresses: addressRows.map((a) => ({
        id: a.id,
        label: a.label,
        addressDetails: a.address_details,
        distinguishingMark: a.distinguishing_mark,
        isDefault: a.is_default,
        createdAt: a.created_at,
      })),
      legacyCustomerId: row.legacy_customer_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
