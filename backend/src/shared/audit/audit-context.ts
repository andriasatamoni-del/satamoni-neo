import { AsyncLocalStorage } from "node:async_hooks";

// Phase 3.1: handlers of sensitive commands add BEFORE/AFTER evidence (and the real entity id) to the audit row that the
// AuditLogInterceptor writes for the request, e.g.
//     auditDetail({ entityId: user.id, before: { role: "cashier", branchId }, after: { role: "branch_manager", branchId } })
// Never put secrets (passwords, tokens) or unnecessary personal data in here.
export interface AuditDetail {
  entityType?: string;
  entityId?: string;
  branchId?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  [key: string]: unknown;
}

export const auditStorage = new AsyncLocalStorage<{ detail: AuditDetail }>();

export function auditDetail(partial: AuditDetail): void {
  const store = auditStorage.getStore();
  if (store) Object.assign(store.detail, partial);
}
