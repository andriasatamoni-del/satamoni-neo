import { Inject, Injectable } from "@nestjs/common";
import { Position } from "../../domain/position.aggregate";
import { POSITION_REPOSITORY, type PositionRepositoryPort } from "../../domain/ports/position-repository.port";
import { DEPARTMENT_REPOSITORY, type DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";
import { DepartmentNotFoundError, DuplicatePositionCodeError } from "../../domain/errors";

export interface RegisterPositionCommand {
  code: string;
  name: string;
  departmentId?: string | null;
  description?: string | null;
}

@Injectable()
export class RegisterPositionHandler {
  constructor(
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepositoryPort,
    @Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepositoryPort
  ) {}

  async execute(command: RegisterPositionCommand): Promise<Position> {
    if (await this.positions.existsByCode(command.code.trim())) throw new DuplicatePositionCodeError();
    if (command.departmentId && !(await this.departments.findById(command.departmentId))) throw new DepartmentNotFoundError();

    const position = Position.register(command);
    await this.positions.save(position);
    return position;
  }
}
