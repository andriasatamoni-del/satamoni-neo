import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input } from "../shared/ui/Field";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface AuditLogRecord {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  branchId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function AuditLogPage() {
  const [filters, setFilters] = useState({ entityType: "", entityId: "", actorUserId: "", action: "" });
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const query = new URLSearchParams();
  if (filters.entityType) query.set("entityType", filters.entityType);
  if (filters.entityId) query.set("entityId", filters.entityId);
  if (filters.actorUserId) query.set("actorUserId", filters.actorUserId);
  if (filters.action) query.set("action", filters.action);
  const qs = query.toString();

  const logsQuery = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => apiRequest<AuditLogRecord[]>(`/audit-logs${qs ? `?${qs}` : ""}`),
  });

  const notAllowed = logsQuery.isError && logsQuery.error instanceof ApiError && logsQuery.error.status === 403;
  const logs = logsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="سجل التدقيق" description="كل الإجراءات اللي غيّرت حالة في النظام - مين عمل إيه وامتى" />

      {notAllowed ? (
        <Card>
          <CardBody>
            <EmptyState>مفيش صلاحية عندك لرؤية سجل التدقيق</EmptyState>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>فلاتر</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Field label="نوع الكيان (مثال: branches)">
                  <Input value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })} />
                </Field>
                <Field label="معرّف الكيان">
                  <Input value={filters.entityId} onChange={(e) => setFilters({ ...filters, entityId: e.target.value })} />
                </Field>
                <Field label="معرّف المستخدم الفاعل">
                  <Input value={filters.actorUserId} onChange={(e) => setFilters({ ...filters, actorUserId: e.target.value })} />
                </Field>
                <Field label="الإجراء (مثال: LOGIN_FAILED)">
                  <Input value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>السجلات ({logs.length})</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR><TH>الوقت</TH><TH>الفاعل</TH><TH>الإجراء</TH><TH>الكيان</TH><TH></TH></TR>
                </THead>
                <TBody>
                  {logs.map((log) => (
                    <Fragment key={log.id}>
                      <TR>
                        <TD>{new Date(log.createdAt).toLocaleString("en-US")}</TD>
                        <TD className="font-mono text-xs">{log.actorUserId ?? "-"}</TD>
                        <TD className="font-semibold text-slate-900">{log.action}</TD>
                        <TD>{log.entityType ? `${log.entityType}${log.entityId ? ` / ${log.entityId}` : ""}` : "-"}</TD>
                        <TD>
                          {log.metadata && (
                            <Button size="sm" variant="ghost" onClick={() => setOpenRowId(openRowId === log.id ? null : log.id)}>
                              {openRowId === log.id ? "إخفاء" : "التفاصيل"}
                            </Button>
                          )}
                        </TD>
                      </TR>
                      {openRowId === log.id && log.metadata && (
                        <TR>
                          <TD colSpan={5}>
                            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </TD>
                        </TR>
                      )}
                    </Fragment>
                  ))}
                </TBody>
              </Table>
              {logs.length === 0 && <EmptyState>مفيش سجلات تدقيق مطابقة</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
