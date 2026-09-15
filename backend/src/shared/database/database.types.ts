// كل جداول النظام مجمّعة هنا في نوع واحد لـKysely - كل context بيضيف نوع الجدول بتاعه هنا (composition
// صريحة، مش declaration merging) وقت ما يتبني. schema واحد مشترك لأننا لسه مونوليث معياري واحد
// (راجع خطة إعادة البناء قسم 1) - لو أي context اتفصل لخدمة منفصلة لاحقًا، جدوله بس بتتشال من هنا.
import type { UsersTable } from "../../contexts/identity-access/infrastructure/persistence/user.schema";
import type { EventOutboxTable } from "../events/event-outbox.schema";

export interface Database {
  users: UsersTable;
  event_outbox: EventOutboxTable;
}
