import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { useCan } from "../../shared/auth/AuthContext";
import { PERMISSION } from "../../shared/auth/permissions";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Badge, type Tone } from "../../shared/ui/Badge";
import { Pagination } from "../../shared/ui/Pagination";
import { useListState } from "../../shared/ui/useListState";
import { toQueryString } from "../../shared/api/usePaginatedQuery";

type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";
interface ActionCenterAlert {
  type: string;
  severity: AlertSeverity;
  branchId: string | null;
  branchName: string | null;
  description: string;
  detail?: string;
}
interface ActionCenterReport {
  from: string;
  to: string;
  alerts: ActionCenterAlert[];
  countsBySeverity: Record<AlertSeverity, number>;
  total: number;
  limit: number;
  offset: number;
}

const SEVERITY_TONES: Record<AlertSeverity, Tone> = { HIGH: "danger", MEDIUM: "warning", LOW: "neutral" };
const SEVERITY_LABELS: Record<AlertSeverity, string> = { HIGH: "عاجل", MEDIUM: "متوسط", LOW: "منخفض" };

// مركز التنبيهات - نقطة واحدة تجمّع كل استثناء يستاهل انتباه فوري (نفس مفهوم db/action-center.js
// بالريبو القديم بالظبط). فحص يومي سريع (آخر 7 أيام)، مش تقرير تحليلي طويل المدى زي باقي التقارير
export function ActionCenterPanel() {
  const canSee = useCan()(PERMISSION.REPORTS_VIEW);
  const alertsList = useListState([] as const, { prefix: "alerts." });
  const query = useQuery({
    queryKey: ["reports", "action-center", "page", alertsList.params],
    queryFn: () => apiRequest<ActionCenterReport>(`/reports/action-center${toQueryString({ ...alertsList.params, paginate: 1 })}`),
    placeholderData: keepPreviousData,
    retry: false,
    enabled: canSee,
  });

  // كاشير/كول سنتر/سائق معندهمش reports.view - نفس أسلوب DashboardSummary بالظبط
  if (!canSee || query.isError) return null;
  const data = query.data;
  if (data && data.total === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>مركز التنبيهات</CardTitle>
        {data && (
          <div className="flex gap-1.5">
            {(["HIGH", "MEDIUM", "LOW"] as const).map(
              (sev) =>
                data.countsBySeverity[sev] > 0 && (
                  <Badge key={sev} tone={SEVERITY_TONES[sev]}>
                    {SEVERITY_LABELS[sev]}: {data.countsBySeverity[sev]}
                  </Badge>
                )
            )}
          </div>
        )}
      </CardHeader>
      <CardBody>
        {!data ? (
          <p className="text-sm text-slate-400">بيتم التحميل...</p>
        ) : (
          <ul className="space-y-2">
            {data.alerts.map((alert, i) => (
              <li key={data.offset + i} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <Badge tone={SEVERITY_TONES[alert.severity]}>{SEVERITY_LABELS[alert.severity]}</Badge>
                <div>
                  <p className="text-sm font-medium text-slate-800">{alert.description}</p>
                  {alert.detail && <p className="mt-0.5 text-xs text-slate-500">{alert.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && (
          <Pagination total={data.total} limit={data.limit} offset={data.offset} onPageChange={alertsList.setPage} isFetching={query.isFetching} />
        )}
      </CardBody>
    </Card>
  );
}
