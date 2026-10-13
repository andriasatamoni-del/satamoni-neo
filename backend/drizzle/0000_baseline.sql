-- Baseline: the complete schema as of the last Kysely migration (058_menu_category_archive_and_layout), produced by
-- `pg_dump --schema-only --no-owner --no-privileges` of a database migrated through 001..058, plus the seed rows those
-- migrations inserted (044: the Talabat system user, 045: the home tiles).
--
-- Databases that already ran the Kysely migrations (production, existing dev databases) never execute this file:
-- src/migrations/run-migrations.ts sees kysely_migration at 058 and records this baseline as applied instead.
-- Fresh databases (tests, a new environment) run it as the first migration.
--
-- Triggers and functions live here (and in later custom migrations), not in the Drizzle TypeScript schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE FUNCTION public.audit_logs_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'UPDATE'
         AND NEW.id = OLD.id AND NEW.action = OLD.action
         AND NEW.entity_type IS NOT DISTINCT FROM OLD.entity_type
         AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
         AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
         AND NEW.created_at = OLD.created_at
         AND NEW.outcome = OLD.outcome
         AND NEW.http_status IS NOT DISTINCT FROM OLD.http_status
         AND (NEW.actor_user_id IS NULL OR NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id)
         AND (NEW.branch_id IS NULL OR NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id)
      THEN
        RETURN NEW; -- ON DELETE SET NULL cascade of a deleted user/branch only
      END IF;
      RAISE EXCEPTION 'audit_logs is append-only (% rejected)', TG_OP USING ERRCODE = 'insufficient_privilege';
    END $$;

CREATE FUNCTION public.audit_logs_no_truncate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN RAISE EXCEPTION 'audit_logs is append-only (TRUNCATE rejected)' USING ERRCODE = 'insufficient_privilege'; END $$;

CREATE FUNCTION public.block_non_draft_payroll_run_employees_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      run_status TEXT;
    BEGIN
      SELECT status INTO run_status FROM payroll_runs WHERE id = COALESCE(NEW.payroll_run_id, OLD.payroll_run_id);
      IF run_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'قائمة الرواتب دي مش DRAFT - غير قابلة للتعديل، اعمل قائمة جديدة بدل ما تعدّلها';
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

CREATE FUNCTION public.block_posted_journal_entry_line_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      entry_status TEXT;
    BEGIN
      SELECT status INTO entry_status FROM journal_entries WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
      IF entry_status = 'POSTED' THEN
        RAISE EXCEPTION 'القيد ده POSTED بالفعل - غير قابل للتعديل، اعمل قيد عكسي بدل ما تعدّله';
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

CREATE FUNCTION public.check_journal_entry_balanced() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      target_entry_id UUID;
      total_debit NUMERIC;
      total_credit NUMERIC;
    BEGIN
      target_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
      SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO total_debit, total_credit
      FROM journal_entry_lines WHERE journal_entry_id = target_entry_id;
      IF total_debit <> total_credit THEN
        RAISE EXCEPTION 'القيد رقم % غير متزن: مدين % ≠ دائن % - لازم يتساووا بالظبط', target_entry_id, total_debit, total_credit;
      END IF;
      RETURN NULL;
    END;
    $$;

CREATE FUNCTION public.prevent_posting_to_closed_period() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      period_status TEXT;
    BEGIN
      IF NEW.status = 'DRAFT' OR OLD.status <> 'DRAFT' THEN RETURN NEW; END IF;
      SELECT status INTO period_status FROM accounting_periods
        WHERE year = EXTRACT(YEAR FROM NEW.entry_date)::int AND month = EXTRACT(MONTH FROM NEW.entry_date)::int;
      IF period_status = 'CLOSED' THEN
        RAISE EXCEPTION 'الشهر المحاسبي %-% مقفول - مينفعش يترحّل عليه أي قيد جديد',
          EXTRACT(YEAR FROM NEW.entry_date)::int, EXTRACT(MONTH FROM NEW.entry_date)::int;
      END IF;
      RETURN NEW;
    END;
    $$;

CREATE TABLE public.accounting_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    closed_by uuid,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounting_periods_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text])))
);

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    account_type text NOT NULL,
    parent_account_id uuid,
    branch_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    is_system_account boolean DEFAULT false NOT NULL,
    legacy_account_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounts_account_type_check CHECK ((account_type = ANY (ARRAY['ASSET'::text, 'LIABILITY'::text, 'EQUITY'::text, 'REVENUE'::text, 'COGS'::text, 'EXPENSE'::text])))
);

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    actor_user_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    branch_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    outcome text DEFAULT 'SUCCESS'::text NOT NULL,
    http_status integer,
    CONSTRAINT audit_logs_outcome_check CHECK ((outcome = ANY (ARRAY['SUCCESS'::text, 'DENIED'::text, 'FAILED'::text])))
);

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;

CREATE TABLE public.bank_accounts (
    id uuid NOT NULL,
    bank_id uuid NOT NULL,
    treasury_id uuid NOT NULL,
    account_number text,
    iban text,
    bank_branch_name text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.banks (
    id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.branch_days (
    id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    closed_by uuid NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    total_sales numeric DEFAULT 0 NOT NULL,
    order_count integer DEFAULT 0 NOT NULL,
    cash_variance_total numeric DEFAULT 0 NOT NULL,
    manager_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.branch_stock_balances (
    branch_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    quantity numeric DEFAULT 0 NOT NULL
);

CREATE TABLE public.branch_stock_thresholds (
    branch_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    reorder_point numeric,
    min_stock numeric,
    max_stock numeric,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    hours text,
    lat numeric,
    lng numeric,
    is_central_kitchen boolean DEFAULT false NOT NULL,
    supports_dine_in boolean DEFAULT true NOT NULL,
    legacy_branch_id integer,
    talabat_branch_id text
);

CREATE TABLE public.cash_drawer_entries (
    id uuid NOT NULL,
    shift_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    user_id uuid NOT NULL,
    entry_type text NOT NULL,
    amount numeric NOT NULL,
    label text NOT NULL,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_drawer_entries_entry_type_check CHECK ((entry_type = ANY (ARRAY['EXPENSE'::text, 'PURCHASE'::text])))
);

CREATE TABLE public.cashier_shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    opening_cash numeric NOT NULL,
    opening_notes text,
    closed_at timestamp with time zone,
    closed_by uuid,
    actual_cash numeric,
    expected_cash numeric,
    cash_variance numeric,
    closing_notes text,
    cash_sales numeric DEFAULT 0 NOT NULL,
    card_sales numeric DEFAULT 0 NOT NULL,
    other_sales numeric DEFAULT 0 NOT NULL,
    order_count integer DEFAULT 0 NOT NULL,
    variance_status text DEFAULT 'NONE'::text NOT NULL,
    variance_reviewed_by uuid,
    variance_reviewed_at timestamp with time zone,
    variance_review_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cash_expenses_total numeric DEFAULT 0 NOT NULL,
    cash_purchases_total numeric DEFAULT 0 NOT NULL,
    CONSTRAINT cashier_shifts_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'CLOSED'::text, 'PENDING_REVIEW'::text]))),
    CONSTRAINT cashier_shifts_variance_status_check CHECK ((variance_status = ANY (ARRAY['NONE'::text, 'PENDING_REVIEW'::text, 'APPROVED'::text, 'ACKNOWLEDGED'::text])))
);

CREATE TABLE public.catalog_layout (
    key text NOT NULL,
    value integer NOT NULL
);

CREATE TABLE public.combo_items (
    id uuid NOT NULL,
    combo_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    CONSTRAINT combo_items_quantity_check CHECK ((quantity > 0))
);

CREATE TABLE public.combos (
    id uuid NOT NULL,
    name text NOT NULL,
    price numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    legacy_combo_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    description text,
    online_only boolean DEFAULT false NOT NULL
);

CREATE TABLE public.complaints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    legacy_order_id integer,
    branch_id uuid,
    followup_id uuid,
    customer_phone text NOT NULL,
    category text NOT NULL,
    description text,
    status text DEFAULT 'open'::text NOT NULL,
    resolution_notes text,
    created_by uuid,
    assigned_to uuid,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_complaint_id integer,
    legacy_source text,
    CONSTRAINT complaints_category_check CHECK ((category = ANY (ARRAY['late_order'::text, 'wrong_item'::text, 'quality'::text, 'other'::text]))),
    CONSTRAINT complaints_channel_check CHECK ((channel = ANY (ARRAY['phone_followup'::text, 'whatsapp'::text, 'messenger'::text, 'instagram'::text]))),
    CONSTRAINT complaints_legacy_source_check CHECK ((legacy_source = ANY (ARRAY['customer_complaints'::text, 'whatsapp_complaints'::text]))),
    CONSTRAINT complaints_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text])))
);

CREATE TABLE public.conversion_order_input_lines (
    id uuid NOT NULL,
    conversion_order_id uuid NOT NULL,
    ingredient_item_id uuid NOT NULL,
    planned_quantity_per_unit numeric NOT NULL,
    planned_quantity numeric NOT NULL,
    actual_quantity numeric,
    unit_cost numeric,
    movement_id uuid
);

CREATE TABLE public.conversion_orders (
    id uuid NOT NULL,
    branch_id uuid NOT NULL,
    recipe_id uuid NOT NULL,
    recipe_version_id uuid NOT NULL,
    output_item_id uuid NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    planned_output_quantity numeric NOT NULL,
    actual_output_quantity numeric,
    output_unit_cost numeric,
    output_movement_id uuid,
    variance_reason text,
    notes text,
    created_by uuid,
    approved_by uuid,
    completed_by uuid,
    cancelled_by uuid,
    approved_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversion_orders_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.customer_addresses (
    id uuid NOT NULL,
    customer_id uuid NOT NULL,
    label text,
    address_details text NOT NULL,
    distinguishing_mark text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    area text,
    street text,
    building text,
    floor text,
    apartment text
);

CREATE TABLE public.customer_followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_order_id integer,
    branch_id uuid,
    customer_phone text NOT NULL,
    call_result text NOT NULL,
    satisfaction_rating text,
    notes text,
    has_complaint boolean DEFAULT false NOT NULL,
    called_by uuid,
    called_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_followup_id integer,
    order_id uuid,
    CONSTRAINT customer_followups_call_result_check CHECK ((call_result = ANY (ARRAY['answered'::text, 'no_answer'::text, 'no_answer_after_3_tries'::text]))),
    CONSTRAINT customer_followups_satisfaction_rating_check CHECK ((satisfaction_rating = ANY (ARRAY['excellent'::text, 'good'::text, 'average'::text, 'bad'::text])))
);

CREATE TABLE public.customers (
    id uuid NOT NULL,
    phone text NOT NULL,
    phone2 text,
    name text,
    address_details text,
    distinguishing_mark text,
    notes text,
    loyalty_points integer DEFAULT 0 NOT NULL,
    password_hash text,
    is_blocked boolean DEFAULT false NOT NULL,
    block_reason text,
    blocked_by uuid,
    blocked_at timestamp with time zone,
    legacy_customer_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email text
);

CREATE TABLE public.delivery_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    driver_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    status text DEFAULT 'ASSIGNED'::text NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    failure_reason text,
    collected_amount numeric,
    settlement_id uuid,
    CONSTRAINT delivery_assignments_status_check CHECK ((status = ANY (ARRAY['UNASSIGNED'::text, 'ASSIGNED'::text, 'OUT_FOR_DELIVERY'::text, 'DELIVERED'::text, 'FAILED'::text, 'RETURNED'::text])))
);

CREATE TABLE public.departments (
    id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    legacy_department_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT departments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);

CREATE TABLE public.driver_attendance_shifts (
    id uuid NOT NULL,
    driver_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    checked_in_by uuid,
    checked_in_at timestamp with time zone DEFAULT now() NOT NULL,
    checked_out_by uuid,
    checked_out_at timestamp with time zone,
    hourly_rate numeric NOT NULL,
    hours_worked numeric,
    wage_amount numeric,
    bonus_total numeric,
    total_pay numeric,
    journal_entry_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_attendance_shifts_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'CLOSED'::text])))
);

CREATE TABLE public.driver_settlements (
    id uuid NOT NULL,
    driver_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    settled_by uuid,
    settled_at timestamp with time zone DEFAULT now() NOT NULL,
    order_count integer DEFAULT 0 NOT NULL,
    cod_expected numeric DEFAULT 0 NOT NULL,
    cod_collected numeric DEFAULT 0 NOT NULL,
    expected_handover numeric DEFAULT 0 NOT NULL,
    actual_handover numeric NOT NULL,
    handover_variance numeric DEFAULT 0 NOT NULL,
    variance_status text DEFAULT 'NONE'::text NOT NULL,
    variance_reviewed_by uuid,
    variance_reviewed_at timestamp with time zone,
    variance_review_notes text,
    bonus_total numeric DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_settlements_variance_status_check CHECK ((variance_status = ANY (ARRAY['NONE'::text, 'PENDING_REVIEW'::text, 'ACKNOWLEDGED'::text, 'APPROVED'::text])))
);

CREATE TABLE public.drivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    branch_id uuid NOT NULL,
    status text DEFAULT 'AVAILABLE'::text NOT NULL,
    legacy_driver_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT drivers_status_check CHECK ((status = ANY (ARRAY['AVAILABLE'::text, 'BUSY'::text, 'OFF_DUTY'::text, 'SUSPENDED'::text, 'INACTIVE'::text])))
);

CREATE TABLE public.employee_attendance_shifts (
    id uuid NOT NULL,
    employee_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    checked_in_at timestamp with time zone DEFAULT now() NOT NULL,
    checked_out_at timestamp with time zone,
    hours_worked numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_attendance_shifts_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'CLOSED'::text])))
);

CREATE TABLE public.employee_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text,
    effective_date date DEFAULT CURRENT_DATE NOT NULL,
    changed_by uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.employee_leave_requests (
    id uuid NOT NULL,
    employee_id uuid NOT NULL,
    leave_type text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    days integer NOT NULL,
    reason text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_leave_requests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    hire_date date,
    base_salary numeric DEFAULT 0 NOT NULL,
    wage_type text DEFAULT 'fixed_monthly'::text NOT NULL,
    hourly_rate numeric,
    working_days_per_month integer,
    shift text,
    restricted_branch_id uuid,
    employee_code text,
    phone text,
    notes text,
    status text DEFAULT 'active'::text NOT NULL,
    termination_date date,
    termination_reason text,
    legacy_employee_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    department_id uuid,
    position_id uuid,
    CONSTRAINT employees_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'terminated'::text]))),
    CONSTRAINT employees_wage_type_check CHECK ((wage_type = ANY (ARRAY['fixed_monthly'::text, 'hourly'::text])))
);

CREATE TABLE public.event_outbox (
    id bigint NOT NULL,
    event_name text NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.event_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.event_outbox_id_seq OWNED BY public.event_outbox.id;

CREATE TABLE public.expense_categories (
    id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    alert_threshold numeric,
    account_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expenses (
    id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    category_id uuid NOT NULL,
    amount numeric NOT NULL,
    notes text,
    supplier_id uuid,
    status text DEFAULT 'SUBMITTED'::text NOT NULL,
    created_by uuid,
    posted_by uuid,
    posted_at timestamp with time zone,
    journal_entry_id uuid,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'POSTED'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.fiscal_year_closings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    net_income numeric DEFAULT 0 NOT NULL,
    closed_by uuid,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    journal_entry_id uuid NOT NULL
);

CREATE TABLE public.goods_receipt_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goods_receipt_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit_cost numeric NOT NULL,
    expiry_date date,
    production_date date
);

CREATE TABLE public.goods_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid,
    supplier_id uuid,
    branch_id uuid NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    received_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    legacy_goods_receipt_id integer,
    supplier_document_number text,
    CONSTRAINT goods_receipts_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'CONFIRMED'::text])))
);

CREATE TABLE public.home_tiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tile_key text NOT NULL,
    href text NOT NULL,
    icon text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.inventory_batch_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.inventory_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_number text NOT NULL,
    inventory_item_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    received_quantity numeric NOT NULL,
    remaining_quantity numeric NOT NULL,
    unit_cost numeric,
    expiry_date date,
    production_date date,
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_batches_source_type_check CHECK ((source_type = ANY (ARRAY['purchase'::text, 'production'::text]))),
    CONSTRAINT inventory_batches_status_check CHECK ((status = ANY (ARRAY['active'::text, 'depleted'::text, 'expired'::text])))
);

CREATE TABLE public.inventory_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    unit_cost numeric,
    item_type text DEFAULT 'raw'::text NOT NULL,
    negative_stock_policy text DEFAULT 'STRICT'::text NOT NULL,
    legacy_inventory_item_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_items_item_type_check CHECK ((item_type = ANY (ARRAY['raw'::text, 'manufactured'::text]))),
    CONSTRAINT inventory_items_negative_stock_policy_check CHECK ((negative_stock_policy = ANY (ARRAY['STRICT'::text, 'ALLOW_WITH_APPROVAL'::text])))
);

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_number text,
    entry_date date NOT NULL,
    description text,
    source_type text NOT NULL,
    source_id text,
    branch_id uuid,
    status text DEFAULT 'POSTED'::text NOT NULL,
    created_by uuid,
    posted_at timestamp with time zone,
    reversed_at timestamp with time zone,
    reversal_of_entry_id uuid,
    reversal_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    posted_by uuid,
    CONSTRAINT journal_entries_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'POSTED'::text, 'REVERSED'::text])))
);

CREATE TABLE public.journal_entry_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id uuid NOT NULL,
    account_id uuid NOT NULL,
    debit numeric DEFAULT 0 NOT NULL,
    credit numeric DEFAULT 0 NOT NULL,
    description text,
    reference_type text,
    reference_id text,
    CONSTRAINT journal_entry_lines_credit_check CHECK ((credit >= (0)::numeric)),
    CONSTRAINT journal_entry_lines_debit_check CHECK ((debit >= (0)::numeric)),
    CONSTRAINT journal_entry_lines_not_both_check CHECK ((NOT ((debit > (0)::numeric) AND (credit > (0)::numeric))))
);

CREATE SEQUENCE public.journal_entry_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.kitchen_stations (
    id uuid NOT NULL,
    branch_id uuid NOT NULL,
    name text NOT NULL,
    printer_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.loyalty_rewards (
    id uuid NOT NULL,
    name text NOT NULL,
    description text,
    image_url text,
    points_cost integer NOT NULL,
    kind text NOT NULL,
    discount_amount numeric,
    variant_id uuid,
    combo_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT loyalty_rewards_kind_check CHECK ((kind = ANY (ARRAY['discount'::text, 'free_item'::text, 'free_combo'::text]))),
    CONSTRAINT loyalty_rewards_kind_target CHECK ((((kind = 'discount'::text) AND (discount_amount > (0)::numeric) AND (variant_id IS NULL) AND (combo_id IS NULL)) OR ((kind = 'free_item'::text) AND (variant_id IS NOT NULL) AND (combo_id IS NULL) AND (discount_amount IS NULL)) OR ((kind = 'free_combo'::text) AND (combo_id IS NOT NULL) AND (variant_id IS NULL) AND (discount_amount IS NULL)))),
    CONSTRAINT loyalty_rewards_points_cost_check CHECK ((points_cost > 0))
);

CREATE TABLE public.loyalty_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    order_id uuid,
    request_id uuid,
    kind text NOT NULL,
    points integer NOT NULL,
    reward_id uuid,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT loyalty_transactions_kind_check CHECK ((kind = ANY (ARRAY['earn'::text, 'redeem'::text, 'reverse_earn'::text, 'refund_redeem'::text, 'adjust'::text])))
);

CREATE TABLE public.media_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mime text NOT NULL,
    content bytea NOT NULL,
    size_bytes integer NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_images_mime_check CHECK ((mime = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text])))
);

CREATE TABLE public.menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    menu_group text DEFAULT 'regular'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    legacy_category_id integer,
    station_id uuid,
    archived_at timestamp with time zone,
    CONSTRAINT menu_categories_menu_group_check CHECK ((menu_group = ANY (ARRAY['regular'::text, 'fasting'::text])))
);

CREATE TABLE public.menu_item_modifier_variant_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    modifier_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    price_delta numeric NOT NULL
);

CREATE TABLE public.menu_item_modifiers (
    id uuid NOT NULL,
    item_id uuid NOT NULL,
    name text NOT NULL,
    price_delta numeric DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    legacy_modifier_id integer
);

CREATE TABLE public.menu_item_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    label text NOT NULL,
    price numeric NOT NULL,
    talabat_price numeric,
    legacy_variant_id integer
);

CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    name text NOT NULL,
    description text,
    image_url text,
    is_best boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    legacy_menu_item_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    station_id uuid
);

CREATE TABLE public.menu_price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    variant_id uuid,
    field_name text NOT NULL,
    old_price numeric,
    new_price numeric,
    changed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT menu_price_history_entity_type_check CHECK ((entity_type = ANY (ARRAY['variant'::text, 'modifier'::text, 'modifier_variant_price'::text])))
);

CREATE TABLE public.order_item_modifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_item_id uuid NOT NULL,
    modifier_id uuid,
    name_at_sale text NOT NULL,
    price_at_sale numeric DEFAULT 0 NOT NULL
);

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    menu_item_id uuid,
    variant_id uuid,
    quantity integer NOT NULL,
    unit_price numeric NOT NULL,
    line_total numeric NOT NULL,
    combo_id uuid,
    CONSTRAINT chk_order_items_item_xor_combo CHECK ((((combo_id IS NOT NULL) AND (menu_item_id IS NULL) AND (variant_id IS NULL)) OR ((combo_id IS NULL) AND (menu_item_id IS NOT NULL) AND (variant_id IS NOT NULL)))),
    CONSTRAINT order_items_quantity_check CHECK (((quantity > 0) AND (quantity <= 10000)))
);

CREATE TABLE public.order_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    kind text NOT NULL,
    channel text NOT NULL,
    recipient text NOT NULL,
    message text NOT NULL,
    status text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_notifications_channel_check CHECK ((channel = 'sms'::text)),
    CONSTRAINT order_notifications_kind_check CHECK ((kind = ANY (ARRAY['confirmation'::text, 'rating_request'::text]))),
    CONSTRAINT order_notifications_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'not_configured'::text])))
);

CREATE TABLE public.order_ratings (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    branch_id uuid,
    stars integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_ratings_stars_check CHECK (((stars >= 1) AND (stars <= 5)))
);

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    order_type text NOT NULL,
    table_number text,
    customer_name text,
    customer_phone text,
    address_details text,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'preparing'::text NOT NULL,
    kitchen_status text DEFAULT 'NEW'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_order_id integer,
    payment_method_id uuid,
    kitchen_accepted_at timestamp with time zone,
    kitchen_ready_at timestamp with time zone,
    rating_token uuid DEFAULT gen_random_uuid() NOT NULL,
    client_request_id uuid,
    source text DEFAULT 'pos'::text NOT NULL,
    customer_notes text,
    CONSTRAINT orders_kitchen_status_check CHECK ((kitchen_status = ANY (ARRAY['NEW'::text, 'ACCEPTED'::text, 'PREPARING'::text, 'READY'::text]))),
    CONSTRAINT orders_order_type_check CHECK ((order_type = ANY (ARRAY['dinein'::text, 'takeaway'::text, 'delivery'::text]))),
    CONSTRAINT orders_source_check CHECK ((source = ANY (ARRAY['pos'::text, 'website'::text, 'whatsapp'::text, 'talabat'::text]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['preparing'::text, 'out_for_delivery'::text, 'completed'::text, 'cancelled'::text])))
);

CREATE TABLE public.payment_adjustment_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    requested_by uuid,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    proposed_payment_method_id uuid,
    proposed_amount numeric NOT NULL,
    amount_delta numeric NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    legacy_adjustment_request_id integer,
    previous_payment_method_id uuid,
    previous_amount numeric,
    CONSTRAINT payment_adjustment_requests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])))
);

CREATE TABLE public.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    settlement_channel text,
    is_active boolean DEFAULT true NOT NULL,
    legacy_payment_method_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    talabat_payment_code text,
    CONSTRAINT payment_methods_kind_check CHECK ((kind = ANY (ARRAY['cash'::text, 'card_or_wallet'::text, 'credit'::text]))),
    CONSTRAINT payment_methods_settlement_channel_check CHECK ((settlement_channel = ANY (ARRAY['visa_pos'::text, 'instapay'::text, 'orange_cash'::text, 'vodafone_cash'::text])))
);

CREATE TABLE public.payment_reconciliation_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid,
    source text NOT NULL,
    external_reference text,
    external_amount numeric NOT NULL,
    external_date date NOT NULL,
    matched_payment_id uuid,
    match_status text DEFAULT 'UNMATCHED'::text NOT NULL,
    notes text,
    entered_by uuid,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_reconciliation_record_id integer,
    import_batch_id uuid,
    CONSTRAINT payment_reconciliation_records_match_status_check CHECK ((match_status = ANY (ARRAY['UNMATCHED'::text, 'MATCHED'::text, 'IGNORED'::text]))),
    CONSTRAINT payment_reconciliation_records_source_check CHECK ((source = ANY (ARRAY['talabat_statement'::text, 'visa_settlement'::text, 'instapay'::text, 'orange_cash'::text])))
);

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    payment_method_id uuid NOT NULL,
    method_kind text NOT NULL,
    settlement_channel text,
    amount numeric NOT NULL,
    locked_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_by uuid,
    legacy_payment_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payroll_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    entry_date date NOT NULL,
    adjustment_type text NOT NULL,
    amount numeric NOT NULL,
    notes text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    payroll_run_id uuid,
    CONSTRAINT payroll_adjustments_adjustment_type_check CHECK ((adjustment_type = ANY (ARRAY['advance'::text, 'penalty'::text, 'bonus'::text]))),
    CONSTRAINT payroll_adjustments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payroll_adjustments_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.payroll_run_employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_run_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    employee_name text NOT NULL,
    branch_id uuid,
    gross_pay numeric DEFAULT 0 NOT NULL,
    advances numeric DEFAULT 0 NOT NULL,
    penalties numeric DEFAULT 0 NOT NULL,
    bonuses numeric DEFAULT 0 NOT NULL,
    net_pay numeric DEFAULT 0 NOT NULL
);

CREATE TABLE public.payroll_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    total_net_pay numeric DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    legacy_payroll_run_id integer,
    CONSTRAINT payroll_runs_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT payroll_runs_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.pos_settings (
    id integer NOT NULL,
    shift_variance_ack_threshold_egp numeric DEFAULT 20 NOT NULL,
    driver_settlement_variance_ack_threshold_egp numeric DEFAULT 30 NOT NULL,
    driver_hourly_rate_egp numeric DEFAULT 33 NOT NULL,
    payment_adjustment_high_threshold_egp numeric DEFAULT 500 NOT NULL,
    production_variance_alert_percent numeric DEFAULT 10 NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_bot_enabled boolean DEFAULT false NOT NULL,
    sms_confirmations_enabled boolean DEFAULT false NOT NULL,
    sms_rating_requests_enabled boolean DEFAULT false NOT NULL,
    online_ordering_enabled boolean DEFAULT false NOT NULL,
    loyalty_points_per_egp numeric DEFAULT 0.1 NOT NULL,
    CONSTRAINT pos_settings_id_check CHECK ((id = 1)),
    CONSTRAINT pos_settings_loyalty_points_per_egp_check CHECK ((loyalty_points_per_egp >= (0)::numeric))
);

CREATE TABLE public.positions (
    id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    department_id uuid,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    legacy_position_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT positions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);

CREATE TABLE public.print_jobs (
    id uuid NOT NULL,
    order_id uuid,
    branch_id uuid NOT NULL,
    print_type text NOT NULL,
    printer_id uuid,
    station_id uuid,
    status text DEFAULT 'PENDING'::text NOT NULL,
    content_html text NOT NULL,
    idempotency_key text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_started_at timestamp with time zone,
    printed_at timestamp with time zone,
    failed_at timestamp with time zone,
    CONSTRAINT chk_print_jobs_order_id CHECK (((order_id IS NOT NULL) OR (print_type = 'TEST_PRINT'::text))),
    CONSTRAINT print_jobs_print_type_check CHECK ((print_type = ANY (ARRAY['CUSTOMER_RECEIPT'::text, 'KITCHEN_TICKET'::text, 'KITCHEN_SUMMARY'::text, 'DELIVERY_SUMMARY'::text, 'DELIVERY_FINAL_RECEIPT'::text, 'DINE_IN_BILL'::text, 'TEST_PRINT'::text]))),
    CONSTRAINT print_jobs_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'PRINTING'::text, 'PRINTED'::text, 'FAILED'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.printers (
    id uuid NOT NULL,
    branch_id uuid NOT NULL,
    name text NOT NULL,
    printer_type text NOT NULL,
    connection_type text DEFAULT 'USB'::text NOT NULL,
    os_printer_name text,
    ip_address text,
    port integer,
    paper_width_mm integer DEFAULT 80 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    is_default_for_type boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT printers_connection_type_check CHECK ((connection_type = ANY (ARRAY['USB'::text, 'LAN'::text]))),
    CONSTRAINT printers_printer_type_check CHECK ((printer_type = ANY (ARRAY['CASHIER'::text, 'KITCHEN'::text, 'DELIVERY'::text, 'REPORT'::text])))
);

CREATE TABLE public.purchase_lines (
    id uuid NOT NULL,
    purchase_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit text,
    unit_price numeric NOT NULL,
    line_total numeric NOT NULL
);

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL
);

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_purchase_order_id integer,
    CONSTRAINT purchase_orders_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SENT'::text, 'PARTIALLY_RECEIVED'::text, 'RECEIVED'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.purchase_request_items (
    id uuid NOT NULL,
    purchase_request_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    requested_quantity numeric NOT NULL,
    unit text,
    notes text
);

CREATE TABLE public.purchase_requests (
    id uuid NOT NULL,
    branch_id uuid NOT NULL,
    requested_by uuid,
    required_date date,
    reason text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejected_by uuid,
    rejection_reason text,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    converted_to_purchase_order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_requests_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'APPROVED'::text, 'REJECTED'::text, 'CONVERTED_TO_PO'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.purchase_return_items (
    id uuid NOT NULL,
    purchase_return_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    unit_cost numeric,
    line_value numeric,
    CONSTRAINT purchase_return_items_quantity_check CHECK ((quantity > (0)::numeric))
);

CREATE TABLE public.purchase_returns (
    id uuid NOT NULL,
    branch_id uuid NOT NULL,
    supplier_id uuid,
    goods_receipt_id uuid,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    reason text NOT NULL,
    notes text,
    total_value numeric,
    journal_entry_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    posted_by uuid,
    posted_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    CONSTRAINT purchase_returns_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'POSTED'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.purchases (
    id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    category text,
    amount numeric NOT NULL,
    notes text,
    supplier_id uuid,
    supplier_document_number text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_by uuid,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    posted_to_inventory boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchases_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'CONFIRMED'::text, 'REJECTED'::text])))
);

CREATE TABLE public.recipe_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_version_id uuid NOT NULL,
    ingredient_item_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit text
);

CREATE TABLE public.recipe_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_id uuid NOT NULL,
    version_number integer NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_at timestamp with time zone,
    archived_at timestamp with time zone,
    CONSTRAINT recipe_versions_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'ARCHIVED'::text])))
);

CREATE TABLE public.recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_type text NOT NULL,
    variant_id uuid,
    inventory_item_id uuid,
    legacy_recipe_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recipes_recipe_type_check CHECK ((recipe_type = ANY (ARRAY['sellable_variant'::text, 'manufactured_item'::text])))
);

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inventory_item_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    movement_type text NOT NULL,
    quantity_delta numeric NOT NULL,
    reason text,
    reference_type text,
    reference_id text,
    performed_by uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_reference_key text,
    unit_cost numeric,
    total_cost numeric,
    CONSTRAINT stock_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['RECEIPT'::text, 'CONSUMPTION'::text, 'ADJUSTMENT'::text, 'TRANSFER_OUT'::text, 'TRANSFER_IN'::text, 'OPENING_BALANCE'::text, 'RETURN_TO_SUPPLIER'::text, 'STOCK_COUNT'::text, 'PRODUCTION_OUT'::text, 'PRODUCTION_IN'::text, 'PRODUCTION_REVERSAL'::text]))),
    CONSTRAINT stock_movements_quantity_delta_check CHECK ((quantity_delta <> (0)::numeric))
);

CREATE TABLE public.stocktake_lines (
    id uuid NOT NULL,
    stocktake_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    system_quantity numeric NOT NULL,
    actual_quantity numeric NOT NULL,
    variance_quantity numeric NOT NULL,
    unit_cost numeric,
    variance_value numeric,
    reason text,
    charge_account_code text,
    inventory_movement_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.stocktakes (
    id uuid NOT NULL,
    branch_id uuid NOT NULL,
    created_by uuid,
    notes text,
    total_variance_value numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.supplier_invoice_lines (
    id uuid NOT NULL,
    supplier_invoice_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    invoiced_quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    line_total numeric NOT NULL
);

CREATE TABLE public.supplier_invoices (
    id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    goods_receipt_id uuid,
    supplier_invoice_number text NOT NULL,
    invoice_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,
    subtotal numeric NOT NULL,
    tax numeric DEFAULT 0 NOT NULL,
    total numeric NOT NULL,
    matched_total numeric DEFAULT 0 NOT NULL,
    variance_amount numeric DEFAULT 0 NOT NULL,
    status text NOT NULL,
    variance_journal_entry_id uuid,
    notes text,
    created_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_invoices_status_check CHECK ((status = ANY (ARRAY['MATCHED'::text, 'VARIANCE_PENDING'::text, 'APPROVED'::text, 'PARTIALLY_PAID'::text, 'PAID'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.supplier_payments (
    id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    supplier_invoice_id uuid,
    treasury_id uuid NOT NULL,
    amount numeric NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    reference_number text,
    notes text,
    journal_entry_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    contact_person text,
    phone text,
    email text,
    address text,
    payment_terms text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    legacy_supplier_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT suppliers_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'BLOCKED'::text])))
);

CREATE TABLE public.talabat_integration_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage text NOT NULL,
    talabat_order_id text,
    message text NOT NULL,
    context jsonb,
    retry_count integer DEFAULT 0 NOT NULL,
    last_retry_at timestamp with time zone,
    status text DEFAULT 'OPEN'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT talabat_integration_errors_stage_check CHECK ((stage = ANY (ARRAY['WEBHOOK'::text, 'SYNC'::text, 'CANCELLATION'::text]))),
    CONSTRAINT talabat_integration_errors_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'RETRYING'::text, 'RESOLVED'::text])))
);

CREATE TABLE public.talabat_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    talabat_order_id text NOT NULL,
    branch_id uuid,
    pos_order_id uuid,
    status text NOT NULL,
    raw_payload jsonb NOT NULL,
    error_reason text,
    canceled_at timestamp with time zone,
    cancellation_source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT talabat_orders_cancellation_source_check CHECK ((cancellation_source = ANY (ARRAY['TALABAT'::text, 'ORPHAN'::text]))),
    CONSTRAINT talabat_orders_status_check CHECK ((status = ANY (ARRAY['RECEIVED'::text, 'MAPPING_ERROR'::text, 'IMPORTED'::text, 'FAILED'::text, 'CANCELED'::text])))
);

CREATE TABLE public.talabat_product_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    talabat_item_id text NOT NULL,
    menu_item_id uuid,
    variant_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.talabat_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dedupe_key text NOT NULL,
    raw_body jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.transfer_request_lines (
    id uuid NOT NULL,
    transfer_request_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    requested_quantity numeric NOT NULL,
    approved_quantity numeric,
    dispatched_quantity numeric,
    received_quantity numeric,
    dispatch_movement_id uuid,
    receive_movement_id uuid
);

CREATE TABLE public.transfer_requests (
    id uuid NOT NULL,
    from_branch_id uuid NOT NULL,
    to_branch_id uuid NOT NULL,
    requested_by uuid,
    required_date date,
    notes text,
    status text DEFAULT 'SUBMITTED'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejected_by uuid,
    rejection_reason text,
    dispatched_by uuid,
    dispatched_at timestamp with time zone,
    received_by uuid,
    received_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transfer_requests_status_check CHECK ((status = ANY (ARRAY['SUBMITTED'::text, 'APPROVED'::text, 'REJECTED'::text, 'DISPATCHED'::text, 'RECEIVED'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.treasuries (
    id uuid NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    branch_id uuid,
    account_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treasuries_kind_check CHECK ((kind = ANY (ARRAY['MAIN'::text, 'BANK'::text])))
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    permission_grants jsonb DEFAULT '[]'::jsonb NOT NULL,
    permission_revokes jsonb DEFAULT '[]'::jsonb NOT NULL,
    pin_hash text,
    is_active boolean DEFAULT true NOT NULL,
    legacy_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'accountant'::text, 'cashier'::text, 'callcenter'::text, 'driver'::text, 'employee'::text])))
);

CREATE TABLE public.whatsapp_conversations (
    id uuid NOT NULL,
    phone text NOT NULL,
    customer_name text,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    CONSTRAINT whatsapp_conversations_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'messenger'::text, 'instagram'::text])))
);

CREATE TABLE public.whatsapp_messages (
    id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    direction text NOT NULL,
    body text NOT NULL,
    wa_message_id text,
    sent_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_messages_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])))
);

CREATE TABLE public.whatsapp_pending_order_lines (
    id uuid NOT NULL,
    pending_order_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    item_name text NOT NULL,
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    modifier_ids jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE public.whatsapp_pending_orders (
    id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    customer_phone text NOT NULL,
    customer_name text,
    order_type text NOT NULL,
    branch_id uuid,
    address_details text,
    total numeric NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    rejection_reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    confirmed_order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_pending_orders_branch_required CHECK (((status = 'DRAFT'::text) OR (branch_id IS NOT NULL))),
    CONSTRAINT whatsapp_pending_orders_order_type_check CHECK ((order_type = ANY (ARRAY['dinein'::text, 'takeaway'::text, 'delivery'::text]))),
    CONSTRAINT whatsapp_pending_orders_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PENDING'::text, 'CONFIRMED'::text, 'REJECTED'::text])))
);

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);

ALTER TABLE ONLY public.event_outbox ALTER COLUMN id SET DEFAULT nextval('public.event_outbox_id_seq'::regclass);

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_year_month_unique UNIQUE (year, month);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_code_key UNIQUE (code);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_treasury_id_key UNIQUE (treasury_id);

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.branch_days
    ADD CONSTRAINT branch_days_branch_date_unique UNIQUE (branch_id, business_date);

ALTER TABLE ONLY public.branch_days
    ADD CONSTRAINT branch_days_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.branch_stock_balances
    ADD CONSTRAINT branch_stock_balances_pk PRIMARY KEY (branch_id, inventory_item_id);

ALTER TABLE ONLY public.branch_stock_thresholds
    ADD CONSTRAINT branch_stock_thresholds_pkey PRIMARY KEY (branch_id, inventory_item_id);

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cash_drawer_entries
    ADD CONSTRAINT cash_drawer_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cashier_shifts
    ADD CONSTRAINT cashier_shifts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.catalog_layout
    ADD CONSTRAINT catalog_layout_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.combo_items
    ADD CONSTRAINT combo_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.combos
    ADD CONSTRAINT combos_name_key UNIQUE (name);

ALTER TABLE ONLY public.combos
    ADD CONSTRAINT combos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversion_order_input_lines
    ADD CONSTRAINT conversion_order_input_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversion_orders
    ADD CONSTRAINT conversion_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer_followups
    ADD CONSTRAINT customer_followups_pkey PRIMARY KEY (id);

ALTER TABLE public.customers
    ADD CONSTRAINT customers_loyalty_points_non_negative CHECK ((loyalty_points >= 0)) NOT VALID;

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_phone_key UNIQUE (phone);

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_assignments
    ADD CONSTRAINT delivery_assignments_order_id_key UNIQUE (order_id);

ALTER TABLE ONLY public.delivery_assignments
    ADD CONSTRAINT delivery_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_code_key UNIQUE (code);

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.driver_attendance_shifts
    ADD CONSTRAINT driver_attendance_shifts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.driver_settlements
    ADD CONSTRAINT driver_settlements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_attendance_shifts
    ADD CONSTRAINT employee_attendance_shifts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_history
    ADD CONSTRAINT employee_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_leave_requests
    ADD CONSTRAINT employee_leave_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.event_outbox
    ADD CONSTRAINT event_outbox_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_name_key UNIQUE (name);

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fiscal_year_closings
    ADD CONSTRAINT fiscal_year_closings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fiscal_year_closings
    ADD CONSTRAINT fiscal_year_closings_year_key UNIQUE (year);

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.home_tiles
    ADD CONSTRAINT home_tiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.home_tiles
    ADD CONSTRAINT home_tiles_tile_key_key UNIQUE (tile_key);

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_batch_number_key UNIQUE (batch_number);

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_name_key UNIQUE (name);

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_entry_number_key UNIQUE (entry_number);

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.kitchen_stations
    ADD CONSTRAINT kitchen_stations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loyalty_rewards
    ADD CONSTRAINT loyalty_rewards_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.media_images
    ADD CONSTRAINT media_images_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_name_key UNIQUE (name);

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_item_modifier_variant_prices
    ADD CONSTRAINT menu_item_modifier_variant_prices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_item_modifier_variant_prices
    ADD CONSTRAINT menu_item_modifier_variant_prices_unique UNIQUE (modifier_id, variant_id);

ALTER TABLE ONLY public.menu_item_modifiers
    ADD CONSTRAINT menu_item_modifiers_item_name_unique UNIQUE (item_id, name);

ALTER TABLE ONLY public.menu_item_modifiers
    ADD CONSTRAINT menu_item_modifiers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_item_variants
    ADD CONSTRAINT menu_item_variants_item_label_unique UNIQUE (item_id, label);

ALTER TABLE ONLY public.menu_item_variants
    ADD CONSTRAINT menu_item_variants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_price_history
    ADD CONSTRAINT menu_price_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_item_modifiers
    ADD CONSTRAINT order_item_modifiers_item_modifier_unique UNIQUE (order_item_id, modifier_id);

ALTER TABLE ONLY public.order_item_modifiers
    ADD CONSTRAINT order_item_modifiers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_notifications
    ADD CONSTRAINT order_notifications_order_kind_key UNIQUE (order_id, kind);

ALTER TABLE ONLY public.order_notifications
    ADD CONSTRAINT order_notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_ratings
    ADD CONSTRAINT order_ratings_order_id_key UNIQUE (order_id);

ALTER TABLE ONLY public.order_ratings
    ADD CONSTRAINT order_ratings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_adjustment_requests
    ADD CONSTRAINT payment_adjustment_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_reconciliation_records
    ADD CONSTRAINT payment_reconciliation_records_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_key UNIQUE (order_id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payroll_run_employees
    ADD CONSTRAINT payroll_run_employees_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pos_settings
    ADD CONSTRAINT pos_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_code_key UNIQUE (code);

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchase_lines
    ADD CONSTRAINT purchase_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchase_request_items
    ADD CONSTRAINT purchase_request_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchase_requests
    ADD CONSTRAINT purchase_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.recipe_versions
    ADD CONSTRAINT recipe_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.recipe_versions
    ADD CONSTRAINT recipe_versions_recipe_version_unique UNIQUE (recipe_id, version_number);

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_inventory_item_id_key UNIQUE (inventory_item_id);

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_variant_id_key UNIQUE (variant_id);

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_legacy_reference_key_key UNIQUE (legacy_reference_key);

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stocktake_lines
    ADD CONSTRAINT stocktake_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stocktakes
    ADD CONSTRAINT stocktakes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.supplier_invoice_lines
    ADD CONSTRAINT supplier_invoice_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_supplier_id_number_key UNIQUE (supplier_id, supplier_invoice_number);

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_name_key UNIQUE (name);

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.talabat_integration_errors
    ADD CONSTRAINT talabat_integration_errors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.talabat_orders
    ADD CONSTRAINT talabat_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.talabat_orders
    ADD CONSTRAINT talabat_orders_pos_order_id_key UNIQUE (pos_order_id);

ALTER TABLE ONLY public.talabat_orders
    ADD CONSTRAINT talabat_orders_talabat_order_id_key UNIQUE (talabat_order_id);

ALTER TABLE ONLY public.talabat_product_mapping
    ADD CONSTRAINT talabat_product_mapping_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.talabat_webhook_events
    ADD CONSTRAINT talabat_webhook_events_dedupe_key_key UNIQUE (dedupe_key);

ALTER TABLE ONLY public.talabat_webhook_events
    ADD CONSTRAINT talabat_webhook_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.transfer_request_lines
    ADD CONSTRAINT transfer_request_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.treasuries
    ADD CONSTRAINT treasuries_account_id_key UNIQUE (account_id);

ALTER TABLE ONLY public.treasuries
    ADD CONSTRAINT treasuries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.combo_items
    ADD CONSTRAINT uq_combo_items_combo_variant UNIQUE (combo_id, variant_id);

ALTER TABLE ONLY public.kitchen_stations
    ADD CONSTRAINT uq_kitchen_stations_branch_name UNIQUE (branch_id, name);

ALTER TABLE ONLY public.talabat_product_mapping
    ADD CONSTRAINT uq_talabat_product_mapping_branch_item UNIQUE (branch_id, talabat_item_id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_channel_phone_key UNIQUE (channel, phone);

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_pending_order_lines
    ADD CONSTRAINT whatsapp_pending_order_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_pending_orders
    ADD CONSTRAINT whatsapp_pending_orders_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX customers_email_key ON public.customers USING btree (lower(email)) WHERE (email IS NOT NULL);

CREATE INDEX idx_adjustment_requests_payment ON public.payment_adjustment_requests USING btree (payment_id);

CREATE INDEX idx_audit_logs_actor ON public.audit_logs USING btree (actor_user_id);

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);

CREATE UNIQUE INDEX idx_branches_talabat_branch_id ON public.branches USING btree (talabat_branch_id);

CREATE INDEX idx_cash_drawer_entries_branch_user_time ON public.cash_drawer_entries USING btree (branch_id, user_id, created_at);

CREATE INDEX idx_cash_drawer_entries_shift ON public.cash_drawer_entries USING btree (shift_id);

CREATE UNIQUE INDEX idx_cashier_shifts_one_active_per_user ON public.cashier_shifts USING btree (user_id) WHERE (status = 'ACTIVE'::text);

CREATE INDEX idx_complaints_open ON public.complaints USING btree (status) WHERE (status <> 'resolved'::text);

CREATE INDEX idx_complaints_phone ON public.complaints USING btree (customer_phone);

CREATE INDEX idx_customer_addresses_customer ON public.customer_addresses USING btree (customer_id);

CREATE INDEX idx_customer_followups_phone ON public.customer_followups USING btree (customer_phone);

CREATE INDEX idx_delivery_assignments_driver ON public.delivery_assignments USING btree (driver_id);

CREATE UNIQUE INDEX idx_driver_attendance_shifts_one_active_per_driver ON public.driver_attendance_shifts USING btree (driver_id) WHERE (status = 'ACTIVE'::text);

CREATE UNIQUE INDEX idx_employee_attendance_shifts_one_active_per_employee ON public.employee_attendance_shifts USING btree (employee_id) WHERE (status = 'ACTIVE'::text);

CREATE INDEX idx_employee_history_effective_date ON public.employee_history USING btree (effective_date);

CREATE INDEX idx_employee_history_employee ON public.employee_history USING btree (employee_id);

CREATE INDEX idx_employee_history_field ON public.employee_history USING btree (field_name);

CREATE INDEX idx_expenses_branch_date ON public.expenses USING btree (branch_id, business_date);

CREATE INDEX idx_expenses_status ON public.expenses USING btree (status);

CREATE INDEX idx_goods_receipts_supplier_doc ON public.goods_receipts USING btree (supplier_id, supplier_document_number);

CREATE INDEX idx_inventory_batches_expiry ON public.inventory_batches USING btree (expiry_date);

CREATE INDEX idx_inventory_batches_item_branch_status ON public.inventory_batches USING btree (inventory_item_id, branch_id, status);

CREATE INDEX idx_inventory_batches_source ON public.inventory_batches USING btree (source_type, source_id);

CREATE INDEX idx_journal_entries_branch_date ON public.journal_entries USING btree (branch_id, entry_date);

CREATE INDEX idx_journal_entries_source ON public.journal_entries USING btree (source_type, source_id);

CREATE INDEX idx_journal_entry_lines_account ON public.journal_entry_lines USING btree (account_id);

CREATE INDEX idx_journal_entry_lines_entry ON public.journal_entry_lines USING btree (journal_entry_id);

CREATE INDEX idx_menu_price_history_entity ON public.menu_price_history USING btree (entity_type, entity_id);

CREATE INDEX idx_menu_price_history_variant ON public.menu_price_history USING btree (variant_id);

CREATE INDEX idx_order_item_modifiers_order_item ON public.order_item_modifiers USING btree (order_item_id);

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);

CREATE INDEX idx_order_ratings_branch ON public.order_ratings USING btree (branch_id);

CREATE INDEX idx_orders_branch_created_at ON public.orders USING btree (branch_id, created_at);

CREATE UNIQUE INDEX idx_payment_methods_talabat_payment_code ON public.payment_methods USING btree (talabat_payment_code);

CREATE INDEX idx_payment_reconciliation_records_import_batch ON public.payment_reconciliation_records USING btree (import_batch_id);

CREATE INDEX idx_payments_branch ON public.payments USING btree (branch_id);

CREATE INDEX idx_payments_settlement_channel ON public.payments USING btree (settlement_channel);

CREATE INDEX idx_payroll_adjustments_employee ON public.payroll_adjustments USING btree (employee_id);

CREATE INDEX idx_payroll_adjustments_entry_date ON public.payroll_adjustments USING btree (entry_date);

CREATE INDEX idx_payroll_adjustments_run ON public.payroll_adjustments USING btree (payroll_run_id);

CREATE INDEX idx_payroll_run_employees_run ON public.payroll_run_employees USING btree (payroll_run_id);

CREATE UNIQUE INDEX idx_payroll_runs_year_month_active ON public.payroll_runs USING btree (year, month) WHERE (status <> 'CANCELLED'::text);

CREATE INDEX idx_positions_department ON public.positions USING btree (department_id);

CREATE INDEX idx_print_jobs_branch_status ON public.print_jobs USING btree (branch_id, status);

CREATE INDEX idx_print_jobs_order ON public.print_jobs USING btree (order_id);

CREATE INDEX idx_purchase_lines_purchase ON public.purchase_lines USING btree (purchase_id);

CREATE INDEX idx_purchases_branch_date ON public.purchases USING btree (branch_id, business_date);

CREATE INDEX idx_purchases_supplier_doc ON public.purchases USING btree (supplier_id, supplier_document_number);

CREATE UNIQUE INDEX idx_recipe_versions_one_active ON public.recipe_versions USING btree (recipe_id) WHERE (status = 'ACTIVE'::text);

CREATE INDEX idx_reconciliation_records_status ON public.payment_reconciliation_records USING btree (match_status);

CREATE INDEX idx_stock_movements_item_branch ON public.stock_movements USING btree (inventory_item_id, branch_id);

CREATE INDEX idx_stock_movements_reference ON public.stock_movements USING btree (reference_type, reference_id);

CREATE INDEX idx_stocktake_lines_stocktake ON public.stocktake_lines USING btree (stocktake_id);

CREATE INDEX idx_talabat_integration_errors_status ON public.talabat_integration_errors USING btree (status);

CREATE INDEX idx_talabat_orders_branch ON public.talabat_orders USING btree (branch_id);

CREATE INDEX idx_transfer_request_lines_request ON public.transfer_request_lines USING btree (transfer_request_id);

CREATE INDEX idx_transfer_requests_from_branch ON public.transfer_requests USING btree (from_branch_id);

CREATE INDEX idx_transfer_requests_required_date ON public.transfer_requests USING btree (required_date);

CREATE INDEX idx_transfer_requests_to_branch ON public.transfer_requests USING btree (to_branch_id);

CREATE UNIQUE INDEX idx_treasuries_one_main_per_branch ON public.treasuries USING btree (branch_id) WHERE (kind = 'MAIN'::text);

CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages USING btree (conversation_id, created_at);

CREATE INDEX loyalty_transactions_customer_idx ON public.loyalty_transactions USING btree (customer_id, created_at DESC);

CREATE UNIQUE INDEX loyalty_transactions_order_kind_key ON public.loyalty_transactions USING btree (order_id, kind) WHERE ((order_id IS NOT NULL) AND (kind <> 'adjust'::text));

CREATE UNIQUE INDEX loyalty_transactions_request_key ON public.loyalty_transactions USING btree (request_id) WHERE (request_id IS NOT NULL);

CREATE INDEX menu_categories_archived_idx ON public.menu_categories USING btree (archived_at);

CREATE INDEX order_notifications_created_at_idx ON public.order_notifications USING btree (created_at);

CREATE UNIQUE INDEX orders_client_request_id_unique ON public.orders USING btree (client_request_id) WHERE (client_request_id IS NOT NULL);

CREATE INDEX orders_customer_phone_idx ON public.orders USING btree (customer_phone, created_at DESC) WHERE (customer_phone IS NOT NULL);

CREATE UNIQUE INDEX uq_journal_entries_auto_source ON public.journal_entries USING btree (source_type, source_id) WHERE ((source_id IS NOT NULL) AND (source_type = ANY (ARRAY['order_sale'::text, 'order_cogs'::text, 'goods_receipt'::text, 'payroll_run'::text, 'payment_adjustment'::text, 'purchase'::text, 'cash_drawer_entry'::text, 'shift_variance'::text, 'driver_settlement'::text, 'driver_attendance_shift'::text, 'conversion_order'::text, 'stock_count'::text, 'supplier_invoice_variance'::text])) AND (created_at >= '2026-10-02 00:00:00+00'::timestamp with time zone));

CREATE UNIQUE INDEX uq_journal_entries_single_reversal ON public.journal_entries USING btree (reversal_of_entry_id) WHERE ((reversal_of_entry_id IS NOT NULL) AND (created_at >= '2026-10-02 00:00:00+00'::timestamp with time zone));

CREATE UNIQUE INDEX uq_stock_movements_business_effect ON public.stock_movements USING btree (reference_type, reference_id, inventory_item_id, movement_type) WHERE ((reference_id IS NOT NULL) AND (reference_type = ANY (ARRAY['order'::text, 'order_cancellation'::text, 'conversion_order'::text])) AND (occurred_at >= '2026-10-02 00:00:00+00'::timestamp with time zone));

CREATE UNIQUE INDEX whatsapp_pending_orders_one_draft_per_conversation ON public.whatsapp_pending_orders USING btree (conversation_id) WHERE (status = 'DRAFT'::text);

CREATE TRIGGER trg_audit_logs_immutable BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

CREATE TRIGGER trg_audit_logs_no_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_no_truncate();

CREATE TRIGGER trg_block_non_draft_payroll_run_employees_changes BEFORE INSERT OR DELETE OR UPDATE ON public.payroll_run_employees FOR EACH ROW EXECUTE FUNCTION public.block_non_draft_payroll_run_employees_changes();

CREATE TRIGGER trg_block_posted_journal_entry_line_changes BEFORE INSERT OR DELETE OR UPDATE ON public.journal_entry_lines FOR EACH ROW EXECUTE FUNCTION public.block_posted_journal_entry_line_changes();

CREATE CONSTRAINT TRIGGER trg_journal_entry_lines_balanced AFTER INSERT OR DELETE OR UPDATE ON public.journal_entry_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_journal_entry_balanced();

CREATE TRIGGER trg_prevent_posting_to_closed_period BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.prevent_posting_to_closed_period();

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_account_id_fkey FOREIGN KEY (parent_account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES public.banks(id);

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_treasury_id_fkey FOREIGN KEY (treasury_id) REFERENCES public.treasuries(id);

ALTER TABLE ONLY public.branch_days
    ADD CONSTRAINT branch_days_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.branch_days
    ADD CONSTRAINT branch_days_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.branch_stock_balances
    ADD CONSTRAINT branch_stock_balances_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.branch_stock_balances
    ADD CONSTRAINT branch_stock_balances_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.branch_stock_thresholds
    ADD CONSTRAINT branch_stock_thresholds_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.branch_stock_thresholds
    ADD CONSTRAINT branch_stock_thresholds_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.branch_stock_thresholds
    ADD CONSTRAINT branch_stock_thresholds_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.cash_drawer_entries
    ADD CONSTRAINT cash_drawer_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.cash_drawer_entries
    ADD CONSTRAINT cash_drawer_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.cash_drawer_entries
    ADD CONSTRAINT cash_drawer_entries_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.cashier_shifts(id);

ALTER TABLE ONLY public.cash_drawer_entries
    ADD CONSTRAINT cash_drawer_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.cashier_shifts
    ADD CONSTRAINT cashier_shifts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.cashier_shifts
    ADD CONSTRAINT cashier_shifts_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.cashier_shifts
    ADD CONSTRAINT cashier_shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.cashier_shifts
    ADD CONSTRAINT cashier_shifts_variance_reviewed_by_fkey FOREIGN KEY (variance_reviewed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.combo_items
    ADD CONSTRAINT combo_items_combo_id_fkey FOREIGN KEY (combo_id) REFERENCES public.combos(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.combo_items
    ADD CONSTRAINT combo_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_item_variants(id);

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_followup_id_fkey FOREIGN KEY (followup_id) REFERENCES public.customer_followups(id);

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.conversion_order_input_lines
    ADD CONSTRAINT conversion_order_input_lines_conversion_order_id_fkey FOREIGN KEY (conversion_order_id) REFERENCES public.conversion_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversion_order_input_lines
    ADD CONSTRAINT conversion_order_input_lines_ingredient_item_id_fkey FOREIGN KEY (ingredient_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.conversion_order_input_lines
    ADD CONSTRAINT conversion_order_input_lines_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES public.stock_movements(id);

ALTER TABLE ONLY public.conversion_orders
    ADD CONSTRAINT conversion_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.conversion_orders
    ADD CONSTRAINT conversion_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.conversion_orders
    ADD CONSTRAINT conversion_orders_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.conversion_orders
    ADD CONSTRAINT conversion_orders_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.conversion_orders
    ADD CONSTRAINT conversion_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.conversion_orders
    ADD CONSTRAINT conversion_orders_output_item_id_fkey FOREIGN KEY (output_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.conversion_orders
    ADD CONSTRAINT conversion_orders_output_movement_id_fkey FOREIGN KEY (output_movement_id) REFERENCES public.stock_movements(id);

ALTER TABLE ONLY public.conversion_orders
    ADD CONSTRAINT conversion_orders_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id);

ALTER TABLE ONLY public.conversion_orders
    ADD CONSTRAINT conversion_orders_recipe_version_id_fkey FOREIGN KEY (recipe_version_id) REFERENCES public.recipe_versions(id);

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.customer_followups
    ADD CONSTRAINT customer_followups_called_by_fkey FOREIGN KEY (called_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.customer_followups
    ADD CONSTRAINT customer_followups_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.delivery_assignments
    ADD CONSTRAINT delivery_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.delivery_assignments
    ADD CONSTRAINT delivery_assignments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.delivery_assignments
    ADD CONSTRAINT delivery_assignments_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);

ALTER TABLE ONLY public.delivery_assignments
    ADD CONSTRAINT delivery_assignments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE ONLY public.delivery_assignments
    ADD CONSTRAINT delivery_assignments_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.driver_settlements(id);

ALTER TABLE ONLY public.driver_attendance_shifts
    ADD CONSTRAINT driver_attendance_shifts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.driver_attendance_shifts
    ADD CONSTRAINT driver_attendance_shifts_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.driver_attendance_shifts
    ADD CONSTRAINT driver_attendance_shifts_checked_out_by_fkey FOREIGN KEY (checked_out_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.driver_attendance_shifts
    ADD CONSTRAINT driver_attendance_shifts_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);

ALTER TABLE ONLY public.driver_attendance_shifts
    ADD CONSTRAINT driver_attendance_shifts_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);

ALTER TABLE ONLY public.driver_settlements
    ADD CONSTRAINT driver_settlements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.driver_settlements
    ADD CONSTRAINT driver_settlements_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);

ALTER TABLE ONLY public.driver_settlements
    ADD CONSTRAINT driver_settlements_settled_by_fkey FOREIGN KEY (settled_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.driver_settlements
    ADD CONSTRAINT driver_settlements_variance_reviewed_by_fkey FOREIGN KEY (variance_reviewed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.employee_attendance_shifts
    ADD CONSTRAINT employee_attendance_shifts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.employee_attendance_shifts
    ADD CONSTRAINT employee_attendance_shifts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);

ALTER TABLE ONLY public.employee_history
    ADD CONSTRAINT employee_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.employee_history
    ADD CONSTRAINT employee_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.employee_leave_requests
    ADD CONSTRAINT employee_leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);

ALTER TABLE ONLY public.employee_leave_requests
    ADD CONSTRAINT employee_leave_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id);

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_restricted_branch_id_fkey FOREIGN KEY (restricted_branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

ALTER TABLE ONLY public.fiscal_year_closings
    ADD CONSTRAINT fiscal_year_closings_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.fiscal_year_closings
    ADD CONSTRAINT fiscal_year_closings_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_goods_receipt_id_fkey FOREIGN KEY (goods_receipt_id) REFERENCES public.goods_receipts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_reversal_of_entry_id_fkey FOREIGN KEY (reversal_of_entry_id) REFERENCES public.journal_entries(id);

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.kitchen_stations
    ADD CONSTRAINT kitchen_stations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.kitchen_stations
    ADD CONSTRAINT kitchen_stations_printer_id_fkey FOREIGN KEY (printer_id) REFERENCES public.printers(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.loyalty_rewards
    ADD CONSTRAINT loyalty_rewards_combo_id_fkey FOREIGN KEY (combo_id) REFERENCES public.combos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.loyalty_rewards
    ADD CONSTRAINT loyalty_rewards_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_item_variants(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.loyalty_rewards(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.media_images
    ADD CONSTRAINT media_images_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.kitchen_stations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_item_modifier_variant_prices
    ADD CONSTRAINT menu_item_modifier_variant_prices_modifier_id_fkey FOREIGN KEY (modifier_id) REFERENCES public.menu_item_modifiers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.menu_item_modifier_variant_prices
    ADD CONSTRAINT menu_item_modifier_variant_prices_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_item_variants(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.menu_item_modifiers
    ADD CONSTRAINT menu_item_modifiers_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.menu_item_variants
    ADD CONSTRAINT menu_item_variants_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id);

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.kitchen_stations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_price_history
    ADD CONSTRAINT menu_price_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.menu_price_history
    ADD CONSTRAINT menu_price_history_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_item_variants(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_item_modifiers
    ADD CONSTRAINT order_item_modifiers_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_combo_id_fkey FOREIGN KEY (combo_id) REFERENCES public.combos(id);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_item_variants(id);

ALTER TABLE ONLY public.order_notifications
    ADD CONSTRAINT order_notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_ratings
    ADD CONSTRAINT order_ratings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.order_ratings
    ADD CONSTRAINT order_ratings_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id);

ALTER TABLE ONLY public.payment_adjustment_requests
    ADD CONSTRAINT payment_adjustment_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.payment_adjustment_requests
    ADD CONSTRAINT payment_adjustment_requests_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);

ALTER TABLE ONLY public.payment_adjustment_requests
    ADD CONSTRAINT payment_adjustment_requests_previous_payment_method_id_fkey FOREIGN KEY (previous_payment_method_id) REFERENCES public.payment_methods(id);

ALTER TABLE ONLY public.payment_adjustment_requests
    ADD CONSTRAINT payment_adjustment_requests_proposed_payment_method_id_fkey FOREIGN KEY (proposed_payment_method_id) REFERENCES public.payment_methods(id);

ALTER TABLE ONLY public.payment_adjustment_requests
    ADD CONSTRAINT payment_adjustment_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.payment_reconciliation_records
    ADD CONSTRAINT payment_reconciliation_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.payment_reconciliation_records
    ADD CONSTRAINT payment_reconciliation_records_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.payment_reconciliation_records
    ADD CONSTRAINT payment_reconciliation_records_matched_payment_id_fkey FOREIGN KEY (matched_payment_id) REFERENCES public.payments(id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id);

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id);

ALTER TABLE ONLY public.payroll_run_employees
    ADD CONSTRAINT payroll_run_employees_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.payroll_run_employees
    ADD CONSTRAINT payroll_run_employees_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);

ALTER TABLE ONLY public.payroll_run_employees
    ADD CONSTRAINT payroll_run_employees_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.pos_settings
    ADD CONSTRAINT pos_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_printer_id_fkey FOREIGN KEY (printer_id) REFERENCES public.printers(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.kitchen_stations(id);

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.purchase_lines
    ADD CONSTRAINT purchase_lines_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.purchase_lines
    ADD CONSTRAINT purchase_lines_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

ALTER TABLE ONLY public.purchase_request_items
    ADD CONSTRAINT purchase_request_items_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.purchase_request_items
    ADD CONSTRAINT purchase_request_items_purchase_request_id_fkey FOREIGN KEY (purchase_request_id) REFERENCES public.purchase_requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.purchase_requests
    ADD CONSTRAINT purchase_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.purchase_requests
    ADD CONSTRAINT purchase_requests_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.purchase_requests
    ADD CONSTRAINT purchase_requests_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.purchase_requests
    ADD CONSTRAINT purchase_requests_converted_to_purchase_order_id_fkey FOREIGN KEY (converted_to_purchase_order_id) REFERENCES public.purchase_orders(id);

ALTER TABLE ONLY public.purchase_requests
    ADD CONSTRAINT purchase_requests_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.purchase_requests
    ADD CONSTRAINT purchase_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_purchase_return_id_fkey FOREIGN KEY (purchase_return_id) REFERENCES public.purchase_returns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_goods_receipt_id_fkey FOREIGN KEY (goods_receipt_id) REFERENCES public.goods_receipts(id);

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_ingredient_item_id_fkey FOREIGN KEY (ingredient_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_recipe_version_id_fkey FOREIGN KEY (recipe_version_id) REFERENCES public.recipe_versions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recipe_versions
    ADD CONSTRAINT recipe_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.recipe_versions
    ADD CONSTRAINT recipe_versions_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_item_variants(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.stocktake_lines
    ADD CONSTRAINT stocktake_lines_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.stocktake_lines
    ADD CONSTRAINT stocktake_lines_inventory_movement_id_fkey FOREIGN KEY (inventory_movement_id) REFERENCES public.stock_movements(id);

ALTER TABLE ONLY public.stocktake_lines
    ADD CONSTRAINT stocktake_lines_stocktake_id_fkey FOREIGN KEY (stocktake_id) REFERENCES public.stocktakes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stocktakes
    ADD CONSTRAINT stocktakes_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.stocktakes
    ADD CONSTRAINT stocktakes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.supplier_invoice_lines
    ADD CONSTRAINT supplier_invoice_lines_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.supplier_invoice_lines
    ADD CONSTRAINT supplier_invoice_lines_supplier_invoice_id_fkey FOREIGN KEY (supplier_invoice_id) REFERENCES public.supplier_invoices(id);

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_goods_receipt_id_fkey FOREIGN KEY (goods_receipt_id) REFERENCES public.goods_receipts(id);

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_variance_journal_entry_id_fkey FOREIGN KEY (variance_journal_entry_id) REFERENCES public.journal_entries(id);

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_supplier_invoice_id_fkey FOREIGN KEY (supplier_invoice_id) REFERENCES public.supplier_invoices(id);

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_treasury_id_fkey FOREIGN KEY (treasury_id) REFERENCES public.treasuries(id);

ALTER TABLE ONLY public.talabat_orders
    ADD CONSTRAINT talabat_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.talabat_orders
    ADD CONSTRAINT talabat_orders_pos_order_id_fkey FOREIGN KEY (pos_order_id) REFERENCES public.orders(id);

ALTER TABLE ONLY public.talabat_product_mapping
    ADD CONSTRAINT talabat_product_mapping_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.talabat_product_mapping
    ADD CONSTRAINT talabat_product_mapping_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);

ALTER TABLE ONLY public.talabat_product_mapping
    ADD CONSTRAINT talabat_product_mapping_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_item_variants(id);

ALTER TABLE ONLY public.transfer_request_lines
    ADD CONSTRAINT transfer_request_lines_dispatch_movement_id_fkey FOREIGN KEY (dispatch_movement_id) REFERENCES public.stock_movements(id);

ALTER TABLE ONLY public.transfer_request_lines
    ADD CONSTRAINT transfer_request_lines_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);

ALTER TABLE ONLY public.transfer_request_lines
    ADD CONSTRAINT transfer_request_lines_receive_movement_id_fkey FOREIGN KEY (receive_movement_id) REFERENCES public.stock_movements(id);

ALTER TABLE ONLY public.transfer_request_lines
    ADD CONSTRAINT transfer_request_lines_transfer_request_id_fkey FOREIGN KEY (transfer_request_id) REFERENCES public.transfer_requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_dispatched_by_fkey FOREIGN KEY (dispatched_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_from_branch_id_fkey FOREIGN KEY (from_branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_to_branch_id_fkey FOREIGN KEY (to_branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.treasuries
    ADD CONSTRAINT treasuries_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY public.treasuries
    ADD CONSTRAINT treasuries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.whatsapp_pending_order_lines
    ADD CONSTRAINT whatsapp_pending_order_lines_pending_order_id_fkey FOREIGN KEY (pending_order_id) REFERENCES public.whatsapp_pending_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.whatsapp_pending_order_lines
    ADD CONSTRAINT whatsapp_pending_order_lines_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_item_variants(id);

ALTER TABLE ONLY public.whatsapp_pending_orders
    ADD CONSTRAINT whatsapp_pending_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.whatsapp_pending_orders
    ADD CONSTRAINT whatsapp_pending_orders_confirmed_order_id_fkey FOREIGN KEY (confirmed_order_id) REFERENCES public.orders(id);

ALTER TABLE ONLY public.whatsapp_pending_orders
    ADD CONSTRAINT whatsapp_pending_orders_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.whatsapp_pending_orders
    ADD CONSTRAINT whatsapp_pending_orders_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);

-- Seed (044): system user that performs Talabat syncs / cancellations internally (createdBy on the order). Its password
-- is a bcrypt hash of a random value nobody knows, and the account is inactive; role=admin so permission checks pass,
-- branch_id NULL because it belongs to no single branch.
INSERT INTO public.users (id, branch_id, name, email, password_hash, role, permission_grants, permission_revokes, is_active)
VALUES (gen_random_uuid(), NULL, 'تكامل Talabat (نظامي)', 'talabat-integration@system.internal',
        crypt(gen_random_uuid()::text, gen_salt('bf', 10)), 'admin', '[]'::jsonb, '[]'::jsonb, false);

-- Seed (045): home screen tiles.
INSERT INTO public.home_tiles (tile_key, href, icon, title, description, display_order) VALUES
  ('orders', '/orders', 'cart', 'الطلبات (POS)', 'تسجيل وتتبّع طلبات البيع', 10),
  ('crm', '/crm', 'users', 'متابعة العملاء والشكاوى', 'المتابعات والشكاوى', 20),
  ('branches', '/branches', 'building', 'الفروع', 'إدارة فروع المطعم', 30),
  ('inventory', '/inventory', 'box', 'المخزون', 'الأصناف والأرصدة', 40),
  ('catalog', '/catalog', 'book', 'قائمة الطعام', 'الأقسام والأصناف', 50),
  ('procurement', '/procurement', 'clipboard', 'المشتريات والموردين', 'أوامر الشراء والاستلام', 60),
  ('delivery', '/delivery', 'truck', 'التوصيل والسائقين', 'تعيينات التوصيل', 70),
  ('accounting', '/accounting', 'coins', 'المحاسبة', 'الحسابات والقيود', 80),
  ('payment-control', '/payment-control', 'card', 'التحكم في المدفوعات والمطابقة', 'الدفعات والمطابقة', 90),
  ('hr-payroll', '/hr-payroll', 'id-card', 'الموارد البشرية والرواتب', 'الموظفين وقوائم الرواتب', 100);
