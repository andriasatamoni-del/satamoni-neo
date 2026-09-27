import type { ActionCenterAlert, AlertSeverity } from "./ports/action-center-reader.port";

const SEVERITY_ORDER: Record<AlertSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

// ترتيب حسب الخطورة (الأعلى الأول) وحساب العدد لكل مستوى - نفس منطق db/action-center.js بالريبو
// القديم بالظبط، مفصول كدالة نقية قابلة للاختبار بدون قاعدة بيانات
export function assembleActionCenterAlerts(alertGroups: ActionCenterAlert[][]): {
  alerts: ActionCenterAlert[];
  countsBySeverity: Record<AlertSeverity, number>;
} {
  const alerts = alertGroups.flat().sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return {
    alerts,
    countsBySeverity: {
      HIGH: alerts.filter((a) => a.severity === "HIGH").length,
      MEDIUM: alerts.filter((a) => a.severity === "MEDIUM").length,
      LOW: alerts.filter((a) => a.severity === "LOW").length,
    },
  };
}
