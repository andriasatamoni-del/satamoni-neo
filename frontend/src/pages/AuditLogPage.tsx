import { Fragment, useState } from "react";
import { ApiError } from "../shared/api/client";
import { usePaginatedQuery } from "../shared/api/usePaginatedQuery";
import { DebouncedInput, ListFilters } from "../shared/ui/ListFilters";
import { Pagination } from "../shared/ui/Pagination";
import { useListState } from "../shared/ui/useListState";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field } from "../shared/ui/Field";
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
  // NEO-6: الفلاتر والصفحة في الـURL، والسيرفر بيرجّع صفحة بصفحة - مفيش سقف 500 سجل زي الأول
  const list = useListState(["entityType", "entityId", "actorUserId", "action", "outcome", "from", "to"] as const);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const logsQuery = usePaginatedQuery<AuditLogRecord>(["audit-logs"], "/audit-logs", list.params);

  const notAllowed = logsQuery.isError && logsQuery.error instanceof ApiError && logsQuery.error.status === 403;
  const logs = logsQuery.data?.items ?? [];
  const textFilter = (name: "entityType" | "entityId" | "actorUserId" | "action", label: string) => (
    <Field label={label}>
      <DebouncedInput value={list.filters[name]} placeholder="" onCommit={(value) => list.setFilter(name, value)} />
    </Field>
  );

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
              <ListFilters
                state={list}
                dateRange
                selects={[
                  { name: "outcome", label: "النتيجة", options: [{ value: "SUCCESS", label: "نجح" }, { value: "DENIED", label: "مرفوض" }, { value: "FAILED", label: "فشل" }] },
                ]}
              >
                {textFilter("entityType", "نوع الكيان (مثال: branches)")}
                {textFilter("entityId", "معرّف الكيان")}
                {textFilter("actorUserId", "معرّف المستخدم الفاعل")}
                {textFilter("action", "الإجراء (مثال: LOGIN_FAILED)")}
              </ListFilters>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>السجلات ({logsQuery.data?.total ?? 0})</CardTitle>
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
              {logs.length === 0 && !logsQuery.isLoading && <EmptyState>مفيش سجلات تدقيق مطابقة</EmptyState>}
              <Pagination
                total={logsQuery.data?.total ?? 0}
                limit={list.limit}
                offset={list.offset}
                onPageChange={list.setPage}
                isFetching={logsQuery.isFetching}
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
