import { Inject, Injectable } from "@nestjs/common";
import { asc, desc, eq, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Customer } from "../../domain/customer.aggregate";
import type { CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";
import { customerAddresses, customerPhones, customers } from "./customers.tables";

type CustomerRow = typeof customers.$inferSelect;

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
            password_hash: customer.passwordHash,
            is_blocked: customer.isBlocked,
            block_reason: customer.blockReason,
            blocked_by: customer.blockedBy,
            blocked_at: customer.blockedAt,
            updated_at: customer.updatedAt,
          },
        });

      await tx.delete(customerPhones).where(eq(customerPhones.customer_id, customer.id));
      await tx.insert(customerPhones).values(
        customer.phones.map((p) => ({
          id: p.id,
          customer_id: customer.id,
          phone: p.phone,
          label: p.label,
          is_primary: p.isPrimary,
          created_at: p.createdAt,
        }))
      );

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
    return row ? this.load(row) : null;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const [row] = await this.db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
    return row ? this.load(row) : null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(eq(sql`lower(${customers.email})`, email.toLowerCase()))
      .limit(1);
    return row ? this.load(row) : null;
  }

  async findByLegacyCustomerId(legacyId: number): Promise<Customer | null> {
    const [row] = await this.db.select().from(customers).where(eq(customers.legacy_customer_id, legacyId)).limit(1);
    return row ? this.load(row) : null;
  }

  private async load(row: CustomerRow): Promise<Customer> {
    const [phoneRows, addressRows] = await Promise.all([
      this.db
        .select()
        .from(customerPhones)
        .where(eq(customerPhones.customer_id, row.id))
        .orderBy(desc(customerPhones.is_primary), asc(customerPhones.created_at), asc(customerPhones.id)),
      this.db
        .select()
        .from(customerAddresses)
        .where(eq(customerAddresses.customer_id, row.id))
        .orderBy(asc(customerAddresses.created_at)),
    ]);
    const phones = phoneRows.length > 0
      ? phoneRows.map((p) => ({ id: p.id, phone: p.phone, label: p.label, isPrimary: p.is_primary, createdAt: p.created_at }))
      : Customer.phonesFromLegacyColumns(row.phone, row.phone2, row.created_at);

    return Customer.reconstitute(row.id, {
      phones,
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
