import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { PaymentMethod, type PaymentMethodKind, type SettlementChannel } from "../../domain/payment-method.aggregate";
import type { PaymentMethodRepositoryPort } from "../../domain/ports/payment-method-repository.port";
import type { PaymentMethodsTable } from "./payment-control.schema";

@Injectable()
export class KyselyPaymentMethodRepository implements PaymentMethodRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(method: PaymentMethod): Promise<void> {
    const row = this.toRow(method);
    await this.db
      .insertInto("payment_methods")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: row.name,
          kind: row.kind,
          settlement_channel: row.settlement_channel,
          is_active: row.is_active,
          talabat_payment_code: row.talabat_payment_code,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<PaymentMethod | null> {
    const row = await this.db.selectFrom("payment_methods").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyPaymentMethodId(legacyId: number): Promise<PaymentMethod | null> {
    const row = await this.db.selectFrom("payment_methods").selectAll().where("legacy_payment_method_id", "=", legacyId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByTalabatPaymentCode(code: string): Promise<PaymentMethod | null> {
    const row = await this.db.selectFrom("payment_methods").selectAll().where("talabat_payment_code", "=", code).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<PaymentMethod[]> {
    const rows = await this.db.selectFrom("payment_methods").selectAll().orderBy("name").execute();
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

  private toDomain(row: Selectable<PaymentMethodsTable>): PaymentMethod {
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
