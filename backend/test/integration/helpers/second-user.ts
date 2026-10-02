import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { KYSELY } from "../../../src/shared/database/database.module";

// Phase 3.1 (BL-05): protected transactions can no longer be approved by the user who created them, so specs that used ONE admin
// to create and approve now need a second, independent user. Returns a bearer token for a freshly created user of `role`.
export async function createSecondUser(app: INestApplication, email: string, role: "accountant" | "admin" | "branch_manager" = "accountant", branchId: string | null = null): Promise<{ token: string; id: string }> {
  const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
  const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
  const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
  const repo = new KyselyUserRepository(app.get(KYSELY));
  const user = User.register({ name: `ثاني-${email}`, email, passwordHash: await new BcryptPasswordHasher().hash("12345678"), role, branchId });
  await repo.save(user);
  const res = await request(app.getHttpServer()).post("/auth/login").send({ email, password: "12345678" });
  return { token: res.body.token as string, id: user.id };
}
