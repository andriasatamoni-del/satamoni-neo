import * as fs from "node:fs";
import * as path from "node:path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require("js-yaml");

// BL-13 regression tests over .github/workflows/db-backup.yml. The original failure was a job-level
// `defaults.run.working-directory: backend` which also applied to the first step (before checkout).
const raw = fs.readFileSync(path.join(__dirname, "../../../../.github/workflows/db-backup.yml"), "utf8");
const doc: any = yaml.load(raw);
const job = doc.jobs.backup;
const steps: any[] = job.steps;
const idx = (pred: (s: any) => boolean) => steps.findIndex(pred);

describe("db-backup workflow (BL-13)", () => {
  test("no job-level working-directory default (it applied to steps that run before checkout)", () => {
    expect(job.defaults?.run?.["working-directory"]).toBeUndefined();
    expect(doc.defaults?.run?.["working-directory"]).toBeUndefined();
  });

  test("every step that sets a working-directory runs AFTER actions/checkout", () => {
    const checkout = idx((s) => String(s.uses ?? "").startsWith("actions/checkout"));
    expect(checkout).toBeGreaterThanOrEqual(0);
    steps.forEach((s, i) => {
      if (s["working-directory"]) expect(i).toBeGreaterThan(checkout);
    });
    // the config validation step (before checkout) must not depend on the repo
    expect(steps[0]["working-directory"]).toBeUndefined();
  });

  test("fails loudly (exit non-zero) when DATABASE_URL or BACKUP_ENCRYPTION_KEY is missing; never prints their values", () => {
    const v = steps[0];
    expect(v.run).toContain("::error::");
    expect(v.run).toMatch(/\[ "\$missing" -eq 0 \]/);
    expect(v.run).not.toMatch(/echo[^\n]*\$\{?(DATABASE_URL|BACKUP_ENCRYPTION_KEY)\}?(?!:)/);
    expect(doc.jobs.backup.steps.some((s: any) => /configured=false|skipped/.test(JSON.stringify(s)))).toBe(false);
  });

  test("order: backup -> restore drill -> encrypt -> upload; the artifact only contains encrypted dumps", () => {
    const names = steps.map((s) => String(s.name ?? s.uses ?? ""));
    const i = (frag: string) => names.findIndex((n) => n.includes(frag));
    expect(i("Backup")).toBeLessThan(i("Restore drill"));
    expect(i("Restore drill")).toBeLessThan(i("Encrypt"));
    expect(i("Encrypt")).toBeLessThan(i("Upload encrypted"));
    const upload = steps[i("Upload encrypted")];
    expect(upload.with.path).toMatch(/\*\.dump\.gpg$/);
    expect(upload.with["if-no-files-found"]).toBe("error");
    expect(upload.with["retention-days"]).toBeLessThanOrEqual(90);
  });

  test("plaintext is removed after encryption and the key is proven to decrypt before upload", () => {
    const enc = steps.find((s) => String(s.name).startsWith("Encrypt"));
    expect(enc.run).toContain("--symmetric --cipher-algo AES256");
    expect(enc.run).toContain("--decrypt");
    expect(enc.run).toContain("cmp ");
    expect(enc.run).toContain('rm -f "$f"');
    expect(enc.run).toContain("--passphrase-fd 0"); // never on the command line
  });

  test("restore drill compares against the source and runs on a throw-away service, never on production", () => {
    const drill = steps.find((s) => String(s.name).startsWith("Restore drill"));
    expect(drill.env.RESTORE_DRILL_DATABASE_URL).toMatch(/localhost:5432/);
    expect(drill.env.RESTORE_DRILL_COMPARE_SOURCE_URL).toContain("secrets.DATABASE_URL");
    expect(job.services["drill-db"].image).toMatch(/^postgres:/);
  });

  test("protected environment, least privilege, single concurrent run, warns when no independent storage is configured", () => {
    expect(job.environment).toBe("production-backup");
    expect(doc.permissions).toEqual({ contents: "read" });
    expect(doc.concurrency.group).toBe("db-backup");
    const s3 = steps.find((s) => String(s.name).includes("S3"));
    expect(s3.run).toContain("::warning::");
    expect(s3.run).toContain("retention-plan.ts");
  });
});
