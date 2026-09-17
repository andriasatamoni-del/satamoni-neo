import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { AuditLogService } from "./audit-log.service";
import type { AuthenticatedUser } from "../../contexts/identity-access/api/types";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const SENSITIVE_KEYS = new Set(["password", "passwordHash", "token", "newPassword", "currentPassword"]);

function redact(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    clone[key] = SENSITIVE_KEYS.has(key) ? "***" : value;
  }
  return clone;
}

// AuditLogInterceptor - مسجّل عام (APP_INTERCEPTOR في AuditModule)، بيغطي أي endpoint بيغيّر حالة في أي
// context تلقائيًا من غير ما الـcontext ده يستدعي أي حاجة يدوي. بيتخطّى GET (قراءة بس) و/auth/* (اللوجن
// بيتسجل صراحة في LoginHandler عشان محتاج يسجّل حتى لما يفشل - قبل أي guard يتفعّل أصلًا). الكتابة
// async/fire-and-forget عشان سجل التدقيق أبدًا ميبطّئش ولا يفشّل الاستجابة الأصلية
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLog: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    if (!MUTATING_METHODS.has(req.method) || req.path.startsWith("/auth")) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((body: unknown) => {
        const entityId =
          body && typeof body === "object" && "id" in body ? String((body as { id: unknown }).id) : null;
        const entityType = req.path.split("/").filter(Boolean)[0] ?? null;

        this.auditLog
          .record({
            actorUserId: req.user?.id ?? null,
            action: `${req.method} ${req.route?.path ?? req.path}`,
            entityType,
            entityId,
            branchId: req.user?.branchId ?? null,
            metadata: redact(req.body),
          })
          .catch(() => {
            // فشل تسجيل التدقيق مايأثرش على الاستجابة الأصلية للمستخدم - نفس فلسفة فشل subscriber
            // واحد في EventBusService.publish
          });
      })
    );
  }
}
