import { Inject, Injectable } from "@nestjs/common";
import { Position } from "../../domain/position.aggregate";
import { POSITION_REPOSITORY, type PositionRepositoryPort } from "../../domain/ports/position-repository.port";
import { DEPARTMENT_REPOSITORY, type DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";
import { DepartmentNotFoundError, PositionNotFoundError } from "../../domain/errors";

export interface UpdatePositionCommand {
  positionId: string;
  name?: string;
  departmentId?: string | null;
  description?: string | null;
  status?: "active" | "inactive";
}

@Injectable()
export class UpdatePositionHandler {
  constructor(
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepositoryPort,
    @Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepositoryPort
  ) {}

  async execute(command: UpdatePositionCommand): Promise<Position> {
    const position = await this.positions.findById(command.positionId);
    if (!position) throw new PositionNotFoundError();
    if (command.departmentId && !(await this.departments.findById(command.departmentId))) throw new DepartmentNotFoundError();

    position.update(command);
    await this.positions.save(position);
    return position;
  }
}
