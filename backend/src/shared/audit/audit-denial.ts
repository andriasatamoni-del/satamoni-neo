import type { ArgumentsHost } from "@nestjs/common";
import type { Request } from "express";
import type { AuditLogService } from "./audit-log.service";
import type { AuthenticatedUser } from "../../contexts/identity-access/api/types";

// Static hook so exception filters (which are instantiated per controller, outside the AuditModule) can record DENIED rows.
// AuditModule registers the real service at boot. Denials are security evidence: failures to write are reported, never thrown.
let recorder: AuditLogService | null = null;

export function registerDenialRecorder(service: AuditLogService): void {
  recorder = service;
}

export async function recordDenied(host: ArgumentsHost, status: number, reason: string): Promise<void> {
  if (!recorder) return;
  try {
    const req = host.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    await recorder.record({
      actorUserId: req.user?.id ?? null,
      action: `DENIED ${req.method} ${req.route?.path ?? req.path}`,
      entityType: req.path.split("/").filter(Boolean)[0] ?? null,
      entityId: typeof req.params?.id === "string" ? req.params.id : null,
      branchId: req.user?.branchId ?? null,
      outcome: "DENIED",
      httpStatus: status,
      metadata: { reason },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("failed to record denied-access audit row:", err instanceof Error ? err.message : err);
  }
}
