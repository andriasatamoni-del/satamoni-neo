import { randomUUID } from "node:crypto";
import { PositionCodeRequiredError, PositionNameRequiredError } from "./errors";

export interface PositionProps {
  code: string;
  name: string;
  departmentId: string | null;
  description: string | null;
  status: "active" | "inactive";
  legacyPositionId: number | null;
  createdAt: Date;
}

// Position - نفس فلسفة HRF-6 بالريبو القديم بالحرف: مسمى وظيفي حقيقي بدل ما يكون نص حر على
// employees.job_title. departmentId اختياري (مش كل مسمى لازم يتبع قسم محدد)
export class Position {
  private constructor(
    public readonly id: string,
    private props: PositionProps
  ) {}

  static register(input: {
    code: string;
    name: string;
    departmentId?: string | null;
    description?: string | null;
    legacyPositionId?: number | null;
  }): Position {
    const code = input.code.trim();
    if (!code) throw new PositionCodeRequiredError();
    const name = input.name.trim();
    if (!name) throw new PositionNameRequiredError();

    return new Position(randomUUID(), {
      code,
      name,
      departmentId: input.departmentId ?? null,
      description: input.description ?? null,
      status: "active",
      legacyPositionId: input.legacyPositionId ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: PositionProps): Position {
    return new Position(id, props);
  }

  update(input: { name?: string; departmentId?: string | null; description?: string | null; status?: "active" | "inactive" }): void {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new PositionNameRequiredError();
      this.props.name = name;
    }
    if (input.departmentId !== undefined) this.props.departmentId = input.departmentId;
    if (input.description !== undefined) this.props.description = input.description;
    if (input.status !== undefined) this.props.status = input.status;
  }

  get code(): string { return this.props.code; }
  get name(): string { return this.props.name; }
  get departmentId(): string | null { return this.props.departmentId; }
  get description(): string | null { return this.props.description; }
  get status(): "active" | "inactive" { return this.props.status; }
  get legacyPositionId(): number | null { return this.props.legacyPositionId; }
  get createdAt(): Date { return this.props.createdAt; }
}
