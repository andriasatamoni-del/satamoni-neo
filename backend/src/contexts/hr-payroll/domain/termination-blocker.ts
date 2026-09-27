// بند معلّق قبل إنهاء خدمة موظف - القرار مش "امنع الإنهاء" (ممكن يكون فيه سبب حقيقي يستوجب إنهاء فوري
// حتى مع وجود معلّقات)، القرار "اعرضها بوضوح واطلب تأكيد صريح" قبل التنفيذ (راجع TerminationBlockersError)
export interface TerminationBlocker {
  code: string;
  message: string;
  [key: string]: unknown;
}
