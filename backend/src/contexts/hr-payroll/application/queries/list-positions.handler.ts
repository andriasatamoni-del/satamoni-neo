import { Inject, Injectable } from "@nestjs/common";
import { Position } from "../../domain/position.aggregate";
import { POSITION_REPOSITORY, type PositionRepositoryPort } from "../../domain/ports/position-repository.port";

@Injectable()
export class ListPositionsHandler {
  constructor(@Inject(POSITION_REPOSITORY) private readonly positions: PositionRepositoryPort) {}

  execute(filter?: { status?: string; departmentId?: string }): Promise<Position[]> {
    return this.positions.list(filter);
  }
}
