import { randomUUID } from "node:crypto";
import { DepartmentCodeRequiredError, DepartmentNameRequiredError } from "./errors";

export interface DepartmentProps {
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  legacyDepartmentId: number | null;
  createdAt: Date;
}

// Department - نفس فلسفة HRF-6 بالريبو القديم بالحرف: قسم حقيقي بدل ما يكون نص حر على
// employees.department. status='inactive' = إخفاء من قوائم الاختيار الجديدة بس - مفيش DELETE أبدًا
// (موظفين حاليين بيشيروا للقسم، وحذفه يفقد سياق تاريخي حقيقي)
export class Department {
  private constructor(
    public readonly id: string,
    private props: DepartmentProps
  ) {}

  static register(input: { code: string; name: string; description?: string | null; legacyDepartmentId?: number | null }): Department {
    const code = input.code.trim();
    if (!code) throw new DepartmentCodeRequiredError();
    const name = input.name.trim();
    if (!name) throw new DepartmentNameRequiredError();

    return new Department(randomUUID(), {
      code,
      name,
      description: input.description ?? null,
      status: "active",
      legacyDepartmentId: input.legacyDepartmentId ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: DepartmentProps): Department {
    return new Department(id, props);
  }

  update(input: { name?: string; description?: string | null; status?: "active" | "inactive" }): void {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new DepartmentNameRequiredError();
      this.props.name = name;
    }
    if (input.description !== undefined) this.props.description = input.description;
    if (input.status !== undefined) this.props.status = input.status;
  }

  get code(): string { return this.props.code; }
  get name(): string { return this.props.name; }
  get description(): string | null { return this.props.description; }
  get status(): "active" | "inactive" { return this.props.status; }
  get legacyDepartmentId(): number | null { return this.props.legacyDepartmentId; }
  get createdAt(): Date { return this.props.createdAt; }
}
