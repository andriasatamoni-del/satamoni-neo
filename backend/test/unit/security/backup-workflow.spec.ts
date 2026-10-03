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
    // encrypted dump + its checksum only: never a plain `*.dump`, never a bare wildcard
    const uploadPaths: string[] = String(upload.with.path).split("\n").map((l) => l.trim()).filter(Boolean);
    expect(uploadPaths.map((p) => p.replace(/^.*\/backups\//, "")).sort()).toEqual(["*.dump.gpg", "*.dump.gpg.sha256"]);
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

  // ---- Backup & Restore Security Remediation ----
  // Minimal evaluator for the ONLY expression shape allowed in the job-level `if` (github.ref == '<literal>').
  // Anything else throws, so a future, more permissive expression cannot slip past this test unnoticed.
  const evalRefCondition = (expr: string, ref: string): boolean => {
    const m = /^\s*(?:\$\{\{\s*)?github\.ref\s*==\s*'([^']+)'(?:\s*\}\})?\s*$/.exec(expr);
    if (!m) throw new Error(`unsupported job condition: ${expr}`);
    return ref === m[1];
  };
  const usesSecretsOrDatabase = (step: any) => /secrets\.|DATABASE_URL|pg_dump|backup\.ts|restore-drill\.ts|BACKUP_ENCRYPTION_KEY|aws s3/.test(JSON.stringify(step));

  test("the backup job only runs from main: the condition is exactly `github.ref == 'refs/heads/main'`", () => {
    expect(job.if).toBe("github.ref == 'refs/heads/main'");
    expect(evalRefCondition(job.if, "refs/heads/main")).toBe(true);
  });

  test.each([
    "refs/heads/feature/exfiltrate-secrets",
    "refs/heads/fix/backup-restore-security",
    "refs/heads/main-evil",
    "refs/heads/MAIN",
    "refs/heads/release/main",
    "refs/tags/main",
    "refs/pull/12/merge",
    "refs/heads/",
    "",
  ])("a run from %p is skipped: it reaches no step that uses a secret or connects to the database", (ref) => {
    const reachable = evalRefCondition(job.if, ref) ? steps : [];
    expect(reachable.filter(usesSecretsOrDatabase)).toEqual([]);
    expect(reachable).toHaveLength(0);
    // the same gate also covers the service container and the protected environment (they belong to the skipped job)
    expect(Object.keys(doc.jobs)).toEqual(["backup"]);
  });

  test("a run from main still reaches every step (scheduled and manual runs keep working)", () => {
    const reachable = evalRefCondition(job.if, "refs/heads/main") ? steps : [];
    expect(reachable).toHaveLength(steps.length);
    expect(reachable.some(usesSecretsOrDatabase)).toBe(true);
    expect(Object.keys(doc.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
  });

  test("no trigger other than schedule/manual, no dispatch inputs, no workflow-level secrets, no step-level escape hatches", () => {
    // pull_request / push / pull_request_target / workflow_run could run attacker-controlled workflow files next to the secrets
    expect(doc.on.workflow_dispatch === null || doc.on.workflow_dispatch === undefined || Object.keys(doc.on.workflow_dispatch ?? {}).length === 0).toBe(true);
    expect(JSON.stringify({ env: doc.env, defaults: doc.defaults })).not.toMatch(/secrets\./);
    for (const step of steps) {
      expect(step["continue-on-error"]).toBeUndefined();
      expect(step.if).toBeUndefined();
    }
  });

  test("least-privilege GITHUB_TOKEN: contents:read at workflow AND job level, checkout does not persist the token", () => {
    expect(doc.permissions).toEqual({ contents: "read" });
    expect(job.permissions).toEqual({ contents: "read" });
    const checkout = steps.find((s) => String(s.uses ?? "").startsWith("actions/checkout"));
    expect(checkout.with["persist-credentials"]).toBe(false);
  });

  test("the encrypted file is checksummed after encryption, verified, and plaintext + its checksum are removed", () => {
    const enc = steps.find((s) => String(s.name).startsWith("Encrypt"));
    expect(enc.run).toContain('sha256sum "$(basename "$f").gpg" > "$(basename "$f").gpg.sha256"');
    expect(enc.run).toContain("sha256sum --check --strict");
    expect(enc.run).toContain('rm -f "$f" "$f.sha256"');
    const names = steps.map((s) => String(s.name ?? s.uses ?? ""));
    const verify = names.findIndex((n) => n.startsWith("Verify the encrypted files"));
    expect(verify).toBeGreaterThan(names.findIndex((n) => n.startsWith("Encrypt")));
    expect(verify).toBeLessThan(names.findIndex((n) => n.includes("S3")));
    expect(verify).toBeLessThan(names.findIndex((n) => n.startsWith("Upload encrypted")));
    const v = steps[verify];
    expect(v.run).toContain("verify-encrypted-backup.ts");
    expect(v.run).toContain("-name '*.dump.gpg.sha256'"); // anything else left in the directory (plaintext) fails the job
    expect(JSON.stringify(v)).not.toMatch(/secrets\./); // checksum verification needs no secret
  });

  test("S3 copy and retention move/delete the checksum together with the encrypted dump", () => {
    const s3 = steps.find((s) => String(s.name).includes("S3"));
    expect(s3.run).toContain('--include "*.dump.gpg" --include "*.dump.gpg.sha256"');
    expect(s3.run).toContain('$name.sha256"');
  });
});
