import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { Position } from "../../domain/position.aggregate";
import { POSITION_REPOSITORY, type PositionRepositoryPort } from "../../domain/ports/position-repository.port";

@Injectable()
export class ListPositionsHandler {
  constructor(@Inject(POSITION_REPOSITORY) private readonly positions: PositionRepositoryPort) {}

  execute(filter?: { status?: string; departmentId?: string }, page?: PageRequest): Promise<{ rows: Position[]; total: number }> {
    return this.positions.listPage(filter, page);
  }
}
