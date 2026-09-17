// بونص ثابت لكل طلب توصيل مُسلَّم - نفس مفهوم calcDriverOrderBonus() في الريبو القديم، بس مبسّط لقيمة
// ثابتة (مش متدرّجة حسب رسوم التوصيل) لأن Order aggregate هنا مالوش مفهوم deliveryFee منفصل عن total
// لسه - تبسيط متعمّد موثّق (راجع migration 018). مستخدم في تسوية الكاش (RegisterDriverSettlementHandler)
// وفي قفل شيفت الحضور (CheckOutDriverHandler) - لازم يفضلوا متطابقين، عشان كده مركزّة هنا في مكان واحد
export const DRIVER_ORDER_BONUS_EGP = 5;
