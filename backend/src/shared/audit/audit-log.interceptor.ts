import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { from, lastValueFrom, Observable } from "rxjs";
import { AuditLogService } from "./audit-log.service";
import { auditStorage, type AuditDetail } from "./audit-context";
import { TransactionService } from "../database/transaction-context";
import type { AuthenticatedUser } from "../../contexts/identity-access/api/types";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
// Routes whose handlers call slow external services (AI model, Meta messaging) must not hold a DB transaction open while waiting;
// for those the audit row is written after the handler, awaited but not transactional.
const NON_TRANSACTIONAL_PREFIXES = ["/whatsapp"];
const SENSITIVE_KEYS = new Set(["password", "passwordHash", "token", "newPassword", "currentPassword", "approvalToken"]);

function redact(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    clone[key] = SENSITIVE_KEYS.has(key) ? "***" : value;
  }
  return clone;
}

// AuditLogInterceptor - مسجّل عام (APP_INTERCEPTOR في AuditModule)، بيغطي أي endpoint بيغيّر حالة في أي
// context تلقائيًا. بيتخطّى GET (قراءة بس) و/auth/* (اللوجن بيتسجل صراحة في LoginHandler).
//
// Phase 3.1 (audit integrity):
//  * RELIABLE - the whole request (handler + its business transaction + the audit row) runs in ONE database transaction. If the
//    audit row can not be written, the request is rolled back and fails: a successful sensitive operation can never exist without
//    its audit record (previously: fire-and-forget, failures swallowed).
//  * EVIDENCE - handlers add before/after values through auditDetail(); the row also stores the (redacted) request body.
//  * DENIED attempts (403 / foreign-branch 404) are recorded separately by the global exception filter / BranchScopeGuard.
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly tx: TransactionService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    if (!MUTATING_METHODS.has(req.method) || req.path.startsWith("/auth")) {
      return next.handle();
    }

    if (NON_TRANSACTIONAL_PREFIXES.some((p) => req.path.startsWith(p))) {
      return from(
        (async () => {
          const store = { detail: {} as AuditDetail };
          const body = await auditStorage.run(store, () => lastValueFrom(next.handle(), { defaultValue: undefined }));
          try {
            await this.auditLog.record({
              actorUserId: req.user?.id ?? null,
              action: `${req.method} ${req.route?.path ?? req.path}`,
              entityType: req.path.split("/").filter(Boolean)[0] ?? null,
              entityId: body && typeof body === "object" && "id" in body ? String((body as { id: unknown }).id) : null,
              branchId: req.user?.branchId ?? null,
              metadata: redact(req.body),
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("audit write failed (non-transactional route):", err instanceof Error ? err.message : err);
          }
          return body;
        })()
      );
    }

    return from(
      this.tx.run(
        async () => {
          const store = { detail: {} as AuditDetail };
          const body = await auditStorage.run(store, () => lastValueFrom(next.handle(), { defaultValue: undefined }));

          const { entityType, entityId, branchId, ...evidence } = store.detail;
          const responseId = body && typeof body === "object" && "id" in body ? String((body as { id: unknown }).id) : null;
          const metadata = { ...(redact(req.body) ?? {}), ...evidence };

          await this.auditLog.record({
            actorUserId: req.user?.id ?? null,
            action: `${req.method} ${req.route?.path ?? req.path}`,
            entityType: entityType ?? req.path.split("/").filter(Boolean)[0] ?? null,
            entityId: entityId ?? responseId,
            branchId: branchId === undefined ? req.user?.branchId ?? null : branchId,
            metadata: Object.keys(metadata).length > 0 ? metadata : null,
            outcome: "SUCCESS",
            httpStatus: null,
          });
          return body;
        },
        { retry: false }
      )
    );
  }
}
