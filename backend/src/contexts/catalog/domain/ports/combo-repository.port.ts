import type { Combo } from "../combo.aggregate";

export interface ComboRepositoryPort {
  save(combo: Combo): Promise<void>;
  findById(id: string): Promise<Combo | null>;
  existsByName(name: string, excludeId?: string): Promise<boolean>;
  list(filter?: { activeOnly?: boolean }): Promise<Combo[]>;
}

export const COMBO_REPOSITORY = Symbol("COMBO_REPOSITORY");
