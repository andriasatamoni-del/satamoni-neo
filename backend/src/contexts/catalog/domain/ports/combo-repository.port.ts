import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { Combo } from "../combo.aggregate";

export interface ComboRepositoryPort {
  save(combo: Combo): Promise<void>;
  findById(id: string): Promise<Combo | null>;
  existsByName(name: string, excludeId?: string): Promise<boolean>;
  list(filter?: { activeOnly?: boolean }): Promise<Combo[]>;
  listPage(filter?: { activeOnly?: boolean }, page?: PageRequest): Promise<{ rows: Combo[]; total: number }>;
}

export const COMBO_REPOSITORY = Symbol("COMBO_REPOSITORY");
