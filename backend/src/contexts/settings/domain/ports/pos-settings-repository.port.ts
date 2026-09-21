import type { PosSettings } from "../pos-settings.aggregate";

// get() بيرجّع الصف الوحيد (بينشئه بالقيم الافتراضية أول مرة لو لسه مش موجود - نفس فلسفة singleton
// row مع lazy init بدل ما يتطلب migration seed منفصل)
export interface PosSettingsRepositoryPort {
  get(): Promise<PosSettings>;
  save(settings: PosSettings): Promise<void>;
}

export const POS_SETTINGS_REPOSITORY = Symbol("POS_SETTINGS_REPOSITORY");
