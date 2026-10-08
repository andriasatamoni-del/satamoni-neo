import * as fs from "node:fs";
import * as path from "node:path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require("js-yaml");

// BL-14 regression tests: static security checks over the GitHub workflows and scripts. They fail if anyone
// re-introduces free-text script execution, shell interpolation of inputs, committed reusable credentials,
// or a privileged workflow without a protected environment.
const repoRoot = path.join(__dirname, "../../../..");
const workflowsDir = path.join(repoRoot, ".github/workflows");
const backendDir = path.join(repoRoot, "backend");

function loadWorkflows(): { file: string; doc: any; raw: string }[] {
  return fs
    .readdirSync(workflowsDir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((file) => {
      const raw = fs.readFileSync(path.join(workflowsDir, file), "utf8");
      return { file, doc: yaml.load(raw), raw };
    });
}

function allSteps(doc: any): any[] {
  return Object.values<any>(doc.jobs ?? {}).flatMap((j) => j.steps ?? []);
}

describe("workflow security (BL-14)", () => {
  const workflows = loadWorkflows();

  test("the unrestricted run-script workflow no longer exists", () => {
    expect(fs.existsSync(path.join(workflowsDir, "run-script.yml"))).toBe(false);
    for (const { raw } of workflows) expect(raw).not.toMatch(/script_path/);
  });

  test("no workflow interpolates github.event.inputs / inputs / github.head_ref or event text into a shell `run:` block", () => {
    const dangerous = /\$\{\{\s*(github\.event\.(inputs|issue|pull_request|comment|head_commit)|inputs\.|github\.head_ref)/;
    for (const { file, doc } of workflows) {
      for (const step of allSteps(doc)) {
        if (typeof step.run === "string") {
          expect({ file, offending: dangerous.test(step.run) }).toEqual({ file, offending: false });
        }
      }
    }
  });

  test("every workflow declares least-privilege top-level permissions", () => {
    for (const { file, doc } of workflows) {
      expect({ file, perms: doc.permissions }).toEqual({ file, perms: { contents: "read" } });
    }
  });

  test("maintenance operation: fixed choice list, protected environment, main only, no free text", () => {
    const wf = workflows.find((w) => w.file === "maintenance-operation.yml");
    expect(wf).toBeDefined();
    const input = wf!.doc.on.workflow_dispatch.inputs.operation;
    expect(input.type).toBe("choice");
    expect(Array.isArray(input.options)).toBe(true);
    const job = wf!.doc.jobs["run-operation"];
    expect(job.environment).toBe("production-maintenance");
    expect(job.if).toContain("refs/heads/main");
    // The only inputs reference is an env: assignment, never inline in run
    const runStep = job.steps.find((s: any) => s.name === "Run approved operation");
    expect(runStep.env.OPERATION).toContain("inputs.operation");
    expect(runStep.run).not.toMatch(/\$\{\{/);
    expect(runStep.run).toContain("exit 1"); // unknown values fail closed
  });

  test("every approved operation maps to an existing reviewed script, and no unmapped option exists", () => {
    const wf = workflows.find((w) => w.file === "maintenance-operation.yml")!;
    const options: string[] = wf.doc.on.workflow_dispatch.inputs.operation.options;
    const runStep = wf.doc.jobs["run-operation"].steps.find((s: any) => s.name === "Run approved operation");
    const mapped = new Map<string, string>();
    for (const m of runStep.run.matchAll(/^\s*([a-z-]+)\)\s+SCRIPT="([^"]+)"/gm)) mapped.set(m[1], m[2]);
    expect([...mapped.keys()].sort()).toEqual([...options].sort());
    for (const script of mapped.values()) {
      expect(script).toMatch(/^scripts\/[a-z-]+\.ts$/);
      expect(fs.existsSync(path.join(backendDir, script))).toBe(true);
    }
  });

  test("production secrets are only used by jobs bound to a protected environment or the backup job (no env, no secrets elsewhere)", () => {
    for (const { file, doc } of workflows) {
      for (const [jobName, job] of Object.entries<any>(doc.jobs)) {
        const text = JSON.stringify(job);
        if (/secrets\.DATABASE_URL/.test(text)) {
          expect({ file, jobName, env: job.environment }).toEqual({ file, jobName, env: expect.any(String) });
        }
      }
    }
  });

  test("third-party actions are limited to the official actions/* namespace", () => {
    for (const { file, doc } of workflows) {
      for (const step of allSteps(doc)) {
        if (step.uses) expect({ file, uses: step.uses }).toEqual({ file, uses: expect.stringMatching(/^actions\//) });
      }
    }
  });

  // Supply chain: a tag like @v4 can be moved to different code after review. Pinning to the full commit SHA makes the
  // code that runs next to the production secrets exactly the code that was reviewed (the "# v4" comment records the tag).
  test("every action is pinned to a full 40-character commit SHA, and the same action always uses the same SHA", () => {
    const seen = new Map<string, Set<string>>();
    for (const { file, doc } of workflows) {
      for (const step of allSteps(doc)) {
        if (!step.uses) continue;
        const m = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40})$/.exec(step.uses);
        expect({ file, uses: step.uses, pinned: !!m }).toEqual({ file, uses: step.uses, pinned: true });
        seen.set(m![1], (seen.get(m![1]) ?? new Set()).add(m![2]));
      }
    }
    for (const [action, shas] of seen) expect({ action, count: shas.size }).toEqual({ action, count: 1 });
  });

  // The SHAs themselves are NOT frozen in a test: Dependabot (.github/dependabot.yml) proposes the bumps as reviewed PRs, and a test
  // that hard-coded them would turn every such PR red. The two tests above keep the invariant that matters: pinned + consistent.

  test("Dependabot keeps the pinned actions current: github-actions ecosystem, weekly, grouped, limited, never auto-merging", () => {
    const file = path.join(repoRoot, ".github/dependabot.yml");
    expect(fs.existsSync(file)).toBe(true);
    const cfg = yaml.load(fs.readFileSync(file, "utf8"));
    expect(cfg.version).toBe(2);
    expect(cfg.updates).toHaveLength(1);
    const u = cfg.updates[0];
    expect(u["package-ecosystem"]).toBe("github-actions");
    expect(u.directory).toBe("/"); // for github-actions "/" covers .github/workflows
    expect(u.schedule).toMatchObject({ interval: "weekly", timezone: "Africa/Cairo" });
    expect(u["open-pull-requests-limit"]).toBeGreaterThan(0);
    expect(u["open-pull-requests-limit"]).toBeLessThanOrEqual(5);
    expect(u.groups["github-actions"].patterns).toEqual(["*"]);
    // nothing that would merge or approve on its own, and no token/secret reference
    expect(JSON.stringify(cfg)).not.toMatch(/auto-?merge|approve|secrets\.|token|registries|ignore/i);
  });

  test("the repository has no workflow that merges, approves or auto-enables merge for Dependabot pull requests", () => {
    for (const { file, raw } of workflows) {
      expect({ file, hit: /dependabot|enable-auto-merge|gh pr merge|auto-merge|pulls\/\d+\/merge/i.test(raw) }).toEqual({ file, hit: false });
    }
  });
});

describe("committed credentials and privileged test-account paths (BL-14)", () => {
  test("no hardcoded reusable credentials anywhere in tracked source", () => {
    const banned = [/Test12345!/, /admin-test@satamoni-neo\.local[\s\S]{0,200}password/i];
    const roots = ["backend/scripts", "backend/src", ".github", "DEPLOYMENT.md", "render.yaml"];
    const hits: string[] = [];
    const walk = (p: string) => {
      const full = path.join(repoRoot, p);
      if (!fs.existsSync(full)) return;
      if (fs.statSync(full).isDirectory()) return fs.readdirSync(full).forEach((c) => walk(path.join(p, c)));
      const txt = fs.readFileSync(full, "utf8");
      if (banned.some((re) => re.test(txt))) hits.push(p);
    };
    roots.forEach(walk);
    expect(hits).toEqual([]);
  });

  test("create-test-admin script is gone and the only remaining mention of the account email is the read-only audit script", () => {
    expect(fs.existsSync(path.join(backendDir, "scripts/create-test-admin.ts"))).toBe(false);
    const audit = fs.readFileSync(path.join(backendDir, "scripts/audit-test-account.ts"), "utf8");
    expect(audit).toContain("BEGIN READ ONLY");
    expect(audit).not.toMatch(/INSERT|UPDATE|DELETE/);
  });

  test("no script creates users with a literal password", () => {
    const dir = path.join(backendDir, "scripts");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const txt = fs.readFileSync(path.join(dir, f), "utf8");
      expect({ f, literal: /password(Hash)?\s*[:=]\s*["'`][^"'`]{4,}["'`]/i.test(txt) }).toEqual({ f, literal: false });
    }
  });
});

describe("disposable-database guard for destructive tests (BL-14 #6)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { assertDisposableDatabase } = require("../../safety/assert-disposable-db");
  test("accepts a local test database", () => {
    expect(() => assertDisposableDatabase("postgresql://u:p@localhost:5432/satamoni_neo_test")).not.toThrow();
  });
  test("rejects a production-looking name, a remote host, and garbage", () => {
    expect(() => assertDisposableDatabase("postgresql://u:p@localhost:5432/satamoni_neo")).toThrow(/disposable/);
    expect(() => assertDisposableDatabase("postgresql://u:p@db.render.com:5432/satamoni_neo_test")).toThrow(/not local/);
    expect(() => assertDisposableDatabase("not a url")).toThrow(/valid URL/);
  });
});
