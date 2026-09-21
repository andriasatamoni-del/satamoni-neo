import type { Generated } from "kysely";

export interface PrintersTable {
  id: string;
  branch_id: string;
  name: string;
  printer_type: string;
  connection_type: string;
  os_printer_name: string | null;
  ip_address: string | null;
  port: number | null;
  paper_width_mm: number;
  is_enabled: boolean;
  is_default_for_type: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface KitchenStationsTable {
  id: string;
  branch_id: string;
  name: string;
  printer_id: string | null;
  is_active: boolean;
  created_at: Generated<Date>;
}

export interface PrintJobsTable {
  id: string;
  order_id: string | null;
  branch_id: string;
  print_type: string;
  printer_id: string | null;
  station_id: string | null;
  status: string;
  content_html: string;
  idempotency_key: string;
  attempts: number;
  last_error: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  printing_started_at: Date | null;
  printed_at: Date | null;
  failed_at: Date | null;
}
