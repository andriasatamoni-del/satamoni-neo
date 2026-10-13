import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { PaymentMethod, type PaymentMethodKind, type SettlementChannel } from "../../domain/payment-method.aggregate";
import type { PaymentMethodRepositoryPort } from "../../domain/ports/payment-method-repository.port";
import { paymentMethods } from "./payment-control.tables";

@Injectable()
export class PaymentMethodRepository implements PaymentMethodRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(method: PaymentMethod): Promise<void> {
    const row = this.toRow(method);
    await this.db
      .insert(paymentMethods)
      .values(row)
      .onConflictDoUpdate({
        target: paymentMethods.id,
        set: {
          name: row.name,
          kind: row.kind,
          settlement_channel: row.settlement_channel,
          is_active: row.is_active,
          talabat_payment_code: row.talabat_payment_code,
        },
      });
  }

  async findById(id: string): Promise<PaymentMethod | null> {
    const [row] = await this.db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyPaymentMethodId(legacyId: number): Promise<PaymentMethod | null> {
    const [row] = await this.db.select().from(paymentMethods).where(eq(paymentMethods.legacy_payment_method_id, legacyId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByTalabatPaymentCode(code: string): Promise<PaymentMethod | null> {
    const [row] = await this.db.select().from(paymentMethods).where(eq(paymentMethods.talabat_payment_code, code)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<PaymentMethod[]> {
    const rows = await this.db.select().from(paymentMethods).orderBy(asc(paymentMethods.name));
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(method: PaymentMethod) {
    return {
      id: method.id,
      name: method.name,
      kind: method.kind,
      settlement_channel: method.settlementChannel,
      is_active: method.isActive,
      legacy_payment_method_id: method.legacyPaymentMethodId,
      talabat_payment_code: method.talabatPaymentCode,
      created_at: method.createdAt,
    };
  }

  private toDomain(row: typeof paymentMethods.$inferSelect): PaymentMethod {
    return PaymentMethod.reconstitute(row.id, {
      name: row.name,
      kind: row.kind as PaymentMethodKind,
      settlementChannel: row.settlement_channel as SettlementChannel | null,
      isActive: row.is_active,
      legacyPaymentMethodId: row.legacy_payment_method_id,
      talabatPaymentCode: row.talabat_payment_code,
      createdAt: row.created_at,
    });
  }
}
