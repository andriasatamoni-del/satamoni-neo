// قاعدة الكسب (نفس pos_settings.loyalty_points_per_egp بالريبو القديم): نقاط = floor(إجمالي الطلب × النسبة)،
// بتتحسب على الإجمالي بعد أي خصم (بما فيه خصم مكافأة نقاط) - مفيش كسب على فلوس ماتدفعتش
export function pointsEarnedFor(orderTotal: number, pointsPerEgp: number): number {
  if (!(orderTotal > 0) || !(pointsPerEgp > 0)) return 0;
  // تقريب قبل floor عشان كسور الحساب العشري (100 × 0.1 = 10.000000000000002)
  return Math.floor(Math.round(orderTotal * pointsPerEgp * 1e6) / 1e6);
}
