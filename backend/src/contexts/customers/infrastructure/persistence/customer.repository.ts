import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Customer } from "../../domain/customer.aggregate";
import type { CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";
import { customerAddresses, customers } from "./customers.tables";

@Injectable()
export class CustomerRepository implements CustomerRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(customer: Customer): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(customers)
        .values({
          id: customer.id,
          phone: customer.phone,
          phone2: customer.phone2,
          email: customer.email,
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
        .onConflictDoUpdate({
          target: customers.id,
          set: {
            phone2: customer.phone2,
            email: customer.email,
            name: customer.name,
            address_details: customer.addressDetails,
            distinguishing_mark: customer.distinguishingMark,
            notes: customer.notes,
            // loyalty_points مش بيتكتب هنا: الرصيد بيتعدّل ذرّيًا من Loyalty context بس (UPDATE ... +/-) -
            // حفظ الـaggregate بقيمة قديمة كان هيمسح نقاط اتضافت في نفس اللحظة
            password_hash: customer.passwordHash,
            is_blocked: customer.isBlocked,
            block_reason: customer.blockReason,
            blocked_by: customer.blockedBy,
            blocked_at: customer.blockedAt,
            updated_at: customer.updatedAt,
          },
        });

      await tx.delete(customerAddresses).where(eq(customerAddresses.customer_id, customer.id));
      for (const address of customer.addresses) {
        await tx.insert(customerAddresses).values({
          id: address.id,
          customer_id: customer.id,
          label: address.label,
          address_details: address.addressDetails,
          area: address.area,
          street: address.street,
          building: address.building,
          floor: address.floor,
          apartment: address.apartment,
          distinguishing_mark: address.distinguishingMark,
          is_default: address.isDefault,
          created_at: address.createdAt,
        });
      }
    });
  }

  async findById(id: string): Promise<Customer | null> {
    const [row] = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
    return row ? this.toDomain(row, await this.loadAddresses(id)) : null;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const [row] = await this.db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
    return row ? this.toDomain(row, await this.loadAddresses(row.id)) : null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(eq(sql`lower(${customers.email})`, email.toLowerCase()))
      .limit(1);
    return row ? this.toDomain(row, await this.loadAddresses(row.id)) : null;
  }

  async findByLegacyCustomerId(legacyId: number): Promise<Customer | null> {
    const [row] = await this.db.select().from(customers).where(eq(customers.legacy_customer_id, legacyId)).limit(1);
    return row ? this.toDomain(row, await this.loadAddresses(row.id)) : null;
  }

  private loadAddresses(customerId: string): Promise<(typeof customerAddresses.$inferSelect)[]> {
    return this.db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customer_id, customerId))
      .orderBy(asc(customerAddresses.created_at));
  }

  private toDomain(row: typeof customers.$inferSelect, addressRows: (typeof customerAddresses.$inferSelect)[]): Customer {
    return Customer.reconstitute(row.id, {
      phone: row.phone,
      phone2: row.phone2,
      email: row.email,
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
        area: a.area,
        street: a.street,
        building: a.building,
        floor: a.floor,
        apartment: a.apartment,
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
