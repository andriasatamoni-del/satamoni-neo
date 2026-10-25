import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { Position } from "../position.aggregate";

export interface PositionRepositoryPort {
  save(position: Position): Promise<void>;
  findById(id: string): Promise<Position | null>;
  findByLegacyPositionId(legacyId: number): Promise<Position | null>;
  existsByCode(code: string, excludeId?: string): Promise<boolean>;
  list(filter?: { status?: string; departmentId?: string }): Promise<Position[]>;
  listPage(filter?: { status?: string; departmentId?: string }, page?: PageRequest): Promise<{ rows: Position[]; total: number }>;
}

export const POSITION_REPOSITORY = Symbol("POSITION_REPOSITORY");
