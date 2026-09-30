import { Kysely, sql } from "kysely";

// STORE-2: الطلب أونلاين بحساب إلزامي + نقاط الولاء + صور المنيو والعروض الحصرية.
// - customers.email: إلزامي في التسجيل الجديد (الحسابات المستوردة من القديم ممكن تكون من غيره لحد ما
//   العميل يكمّل بياناته). فريد بغض النظر عن الحروف الكبيرة/الصغيرة.
// - customer_addresses: العنوان بقى مقسّم (المنطقة/الشارع/العمارة/الدور/الشقة) - address_details فضل
//   النص الكامل المجمّع (للطيار والطباعة والعناوين القديمة المستوردة).
// - loyalty_rewards: كتالوج المكافآت (خصم بمبلغ / صنف هدية / عرض هدية) بعدد نقاط.
// - loyalty_transactions: سجل حركات النقاط append-only؛ customers.loyalty_points هو الرصيد. UNIQUE
//   (order_id, kind) عشان نفس الطلب ميكسبش/يصرفش مرتين، وrequest_id عشان إعادة إرسال نفس الطلب.
// - media_images: الصور المرفوعة جوه القاعدة نفسها (مصغّرة من المتصفح) - مفيش خدمة تخزين خارجية ولا قرص
//   دائم على Render.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE customers ADD COLUMN email text`.execute(db);
  await sql`CREATE UNIQUE INDEX customers_email_key ON customers (lower(email)) WHERE email IS NOT NULL`.execute(db);

  for (const col of ["area", "street", "building", "floor", "apartment"]) {
    await sql`ALTER TABLE customer_addresses ADD COLUMN ${sql.raw(col)} text`.execute(db);
  }

  await sql`ALTER TABLE pos_settings ADD COLUMN loyalty_points_per_egp numeric NOT NULL DEFAULT 0.1
    CHECK (loyalty_points_per_egp >= 0)`.execute(db);

  await db.schema
    .createTable("media_images")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("mime", "text", (col) => col.notNull().check(sql`mime IN ('image/jpeg','image/png','image/webp')`))
    .addColumn("content", "bytea", (col) => col.notNull())
    .addColumn("size_bytes", "integer", (col) => col.notNull())
    .addColumn("uploaded_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`ALTER TABLE combos ADD COLUMN image_url text`.execute(db);
  await sql`ALTER TABLE combos ADD COLUMN description text`.execute(db);
  await sql`ALTER TABLE combos ADD COLUMN online_only boolean NOT NULL DEFAULT false`.execute(db);

  await db.schema
    .createTable("loyalty_rewards")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("image_url", "text")
    .addColumn("points_cost", "integer", (col) => col.notNull().check(sql`points_cost > 0`))
    .addColumn("kind", "text", (col) => col.notNull().check(sql`kind IN ('discount','free_item','free_combo')`))
    .addColumn("discount_amount", "numeric")
    .addColumn("variant_id", "uuid", (col) => col.references("menu_item_variants.id").onDelete("restrict"))
    .addColumn("combo_id", "uuid", (col) => col.references("combos.id").onDelete("restrict"))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "loyalty_rewards_kind_target",
      sql`(kind = 'discount' AND discount_amount > 0 AND variant_id IS NULL AND combo_id IS NULL)
       OR (kind = 'free_item' AND variant_id IS NOT NULL AND combo_id IS NULL AND discount_amount IS NULL)
       OR (kind = 'free_combo' AND combo_id IS NOT NULL AND variant_id IS NULL AND discount_amount IS NULL)`
    )
    .execute();

  await db.schema
    .createTable("loyalty_transactions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("customer_id", "uuid", (col) => col.notNull().references("customers.id").onDelete("cascade"))
    .addColumn("order_id", "uuid", (col) => col.references("orders.id").onDelete("set null"))
    .addColumn("request_id", "uuid")
    .addColumn("kind", "text", (col) =>
      col.notNull().check(sql`kind IN ('earn','redeem','reverse_earn','refund_redeem','adjust')`)
    )
    .addColumn("points", "integer", (col) => col.notNull())
    .addColumn("reward_id", "uuid", (col) => col.references("loyalty_rewards.id").onDelete("set null"))
    .addColumn("note", "text")
    .addColumn("created_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`CREATE UNIQUE INDEX loyalty_transactions_order_kind_key ON loyalty_transactions (order_id, kind)
    WHERE order_id IS NOT NULL AND kind <> 'adjust'`.execute(db);
  await sql`CREATE UNIQUE INDEX loyalty_transactions_request_key ON loyalty_transactions (request_id) WHERE request_id IS NOT NULL`.execute(db);
  await sql`CREATE INDEX loyalty_transactions_customer_idx ON loyalty_transactions (customer_id, created_at DESC)`.execute(db);
  await sql`ALTER TABLE customers ADD CONSTRAINT customers_loyalty_points_non_negative CHECK (loyalty_points >= 0) NOT VALID`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_loyalty_points_non_negative`.execute(db);
  await db.schema.dropTable("loyalty_transactions").execute();
  await db.schema.dropTable("loyalty_rewards").execute();
  await sql`ALTER TABLE combos DROP COLUMN online_only, DROP COLUMN description, DROP COLUMN image_url`.execute(db);
  await db.schema.dropTable("media_images").execute();
  await sql`ALTER TABLE pos_settings DROP COLUMN loyalty_points_per_egp`.execute(db);
  for (const col of ["area", "street", "building", "floor", "apartment"]) {
    await sql`ALTER TABLE customer_addresses DROP COLUMN ${sql.raw(col)}`.execute(db);
  }
  await sql`DROP INDEX IF EXISTS customers_email_key`.execute(db);
  await sql`ALTER TABLE customers DROP COLUMN email`.execute(db);
}
