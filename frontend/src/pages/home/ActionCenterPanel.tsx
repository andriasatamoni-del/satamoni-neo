import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Badge, type Tone } from "../../shared/ui/Badge";

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
}

const SEVERITY_TONES: Record<AlertSeverity, Tone> = { HIGH: "danger", MEDIUM: "warning", LOW: "neutral" };
const SEVERITY_LABELS: Record<AlertSeverity, string> = { HIGH: "عاجل", MEDIUM: "متوسط", LOW: "منخفض" };

// مركز التنبيهات - نقطة واحدة تجمّع كل استثناء يستاهل انتباه فوري (نفس مفهوم db/action-center.js
// بالريبو القديم بالظبط). فحص يومي سريع (آخر 7 أيام)، مش تقرير تحليلي طويل المدى زي باقي التقارير
export function ActionCenterPanel() {
  const query = useQuery({
    queryKey: ["reports", "action-center"],
    queryFn: () => apiRequest<ActionCenterReport>("/reports/action-center"),
    retry: false,
  });

  // كاشير/كول سنتر/سائق معندهمش reports.view - نفس أسلوب DashboardSummary بالظبط
  if (query.isError) return null;
  const data = query.data;
  if (data && data.alerts.length === 0) return null;

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
              <li key={i} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <Badge tone={SEVERITY_TONES[alert.severity]}>{SEVERITY_LABELS[alert.severity]}</Badge>
                <div>
                  <p className="text-sm font-medium text-slate-800">{alert.description}</p>
                  {alert.detail && <p className="mt-0.5 text-xs text-slate-500">{alert.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
