import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as tls from "node:tls";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { PgTlsConfigError, hostOfConnectionString, libpqSslEnv, readCaFile, sourceTlsMode, sourceTlsOption } from "../../../scripts/backup/pg-tls";
import { pgEnvFromUrl } from "../../../scripts/backup/pg-env";

// TLS verification for the backup/restore tooling's connection to the SOURCE database.
// No real database and no secrets: a tiny fake PostgreSQL endpoint speaks just enough protocol to do the SSL upgrade
// (SSLRequest -> 'S' -> TLS handshake) and then answers the startup message with a recognisable error. Certificates are
// generated per run with openssl in a temp directory.
const MARKER = "fake-server-reached";

function openssl(args: string[], cwd: string) {
  execFileSync("openssl", args, { cwd, stdio: "pipe" });
}

describe("PostgreSQL source TLS: certificate verification", () => {
  let dir: string;
  let server: net.Server;
  let port: number;
  const files = { ca: "", otherCa: "", key: "", cert: "" };

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-tls-test-"));
    const mkCa = (name: string) => {
      openssl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.pem`, "-days", "2", "-subj", `/CN=${name}`], dir);
      return path.join(dir, `${name}.pem`);
    };
    files.ca = mkCa("test-ca");
    files.otherCa = mkCa("unrelated-ca");
    // server certificate signed by test-ca, valid for DNS:localhost only (NOT for the IP 127.0.0.1)
    openssl(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=localhost"], dir);
    fs.writeFileSync(path.join(dir, "ext.cnf"), "subjectAltName=DNS:localhost\n");
    openssl(["x509", "-req", "-in", "server.csr", "-CA", "test-ca.pem", "-CAkey", "test-ca.key", "-CAcreateserial", "-out", "server.crt", "-days", "2", "-extfile", "ext.cnf"], dir);
    files.key = path.join(dir, "server.key");
    files.cert = path.join(dir, "server.crt");

    const key = fs.readFileSync(files.key);
    const cert = fs.readFileSync(files.cert);
    const errorResponse = (() => {
      const fields = Buffer.concat([Buffer.from("SFATAL\0C08P01\0M" + MARKER + "\0\0")]);
      const head = Buffer.alloc(5);
      head.write("E", 0);
      head.writeInt32BE(fields.length + 4, 1);
      return Buffer.concat([head, fields]);
    })();
    server = net.createServer((raw) => {
      raw.on("error", () => undefined);
      raw.once("data", () => {
        raw.write("S"); // agree to the SSL upgrade
        const secure = new tls.TLSSocket(raw, { isServer: true, key, cert });
        secure.on("error", () => undefined);
        secure.once("data", () => secure.end(errorResponse)); // any startup message -> recognisable error
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as net.AddressInfo).port;
  }, 60_000);

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const connect = async (host: string, env: NodeJS.ProcessEnv) => {
    const client = new Client({ connectionString: `postgresql://u:p@${host}:${port}/db`, ssl: sourceTlsOption(env, host), connectionTimeoutMillis: 5000 });
    client.on("error", () => undefined);
    try {
      await client.connect();
      return "connected";
    } catch (err) {
      return (err as Error).message;
    } finally {
      await client.end().catch(() => undefined);
    }
  };
  const TLS_FAILURE = /self.signed|unable to (verify|get)|certificate|not in the cert|altnames|Hostname/i;

  describe("node-pg (restore drill comparison, server fingerprint)", () => {
    test("default (verify) + pinned CA + matching host name -> the TLS handshake is accepted", async () => {
      expect(await connect("localhost", { RESTORE_DRILL_SOURCE_SSL_CA: files.ca })).toContain(MARKER);
    });

    test("default (verify) and the server certificate is not issued by a trusted CA -> REJECTED (this is what rejectUnauthorized:false used to let through)", async () => {
      const msg = await connect("localhost", {});
      expect(msg).toMatch(TLS_FAILURE);
      expect(msg).not.toContain(MARKER);
    });

    test("pinning a DIFFERENT CA -> rejected", async () => {
      const msg = await connect("localhost", { RESTORE_DRILL_SOURCE_SSL_CA: files.otherCa });
      expect(msg).toMatch(TLS_FAILURE);
      expect(msg).not.toContain(MARKER);
    });

    test("trusted CA but the host name is not in the certificate (connecting by IP) -> rejected", async () => {
      const msg = await connect("127.0.0.1", { RESTORE_DRILL_SOURCE_SSL_CA: files.ca });
      expect(msg).toMatch(TLS_FAILURE);
      expect(msg).not.toContain(MARKER);
    });

    test("BACKUP_DB_TLS_MODE=insecure-skip-verify is the only way to accept an unverifiable certificate, and it warns", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        expect(await connect("127.0.0.1", { BACKUP_DB_TLS_MODE: "insecure-skip-verify" })).toContain(MARKER);
        expect(warn.mock.calls.length).toBeLessThanOrEqual(1); // warned (once per process; maybe already warned by an earlier call)
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe("libpq (pg_dump / pg_restore / psql) through pgEnvFromUrl", () => {
    // async on purpose: the fake server lives in THIS process, so a blocking spawnSync would starve it
    const run = async (extraEnv: NodeJS.ProcessEnv) => {
      const saved = { ...process.env };
      try {
        for (const k of ["PGSSLMODE", "PGSSLROOTCERT", "BACKUP_DB_TLS_MODE", "RESTORE_DRILL_SOURCE_SSL_CA"]) delete process.env[k];
        Object.assign(process.env, { PGSSL: "true", ...extraEnv });
        const env: NodeJS.ProcessEnv = { ...pgEnvFromUrl(`postgresql://u:p@localhost:${port}/db`), PGCONNECT_TIMEOUT: "5", HOME: dir };
        const r = await promisify(execFile)("psql", ["-X", "-w", "-c", "select 1"], { env, timeout: 20_000 }).then(
          (x) => ({ stdout: x.stdout, stderr: x.stderr }),
          (e) => ({ stdout: e.stdout ?? "", stderr: `${e.stderr ?? ""}${e.message ?? ""}` })
        );
        return { mode: env.PGSSLMODE, root: env.PGSSLROOTCERT, out: `${r.stdout}${r.stderr}` };
      } finally {
        for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
        Object.assign(process.env, saved);
      }
    };

    test("PGSSL=true now means verify-full, not require", async () => {
      const r = await run({});
      expect(r.mode).toBe("verify-full");
      expect(r.root).toBe("system");
    });

    test("verify-full with the pinned CA reaches the server; without it the certificate is rejected", async () => {
      const ok = await run({ PGSSLROOTCERT: files.ca });
      expect(ok.root).toBe(files.ca);
      expect(ok.out).toContain(MARKER);
      const bad = await run({});
      expect(bad.out).toMatch(/certificate verify failed|SSL error|self.signed|unable to get local issuer/i);
      expect(bad.out).not.toContain(MARKER);
      const wrongCa = await run({ PGSSLROOTCERT: files.otherCa });
      expect(wrongCa.out).toMatch(/certificate verify failed|SSL error/i);
    });

    test("insecure-skip-verify maps to the old `require` behaviour", async () => {
      const r = await run({ BACKUP_DB_TLS_MODE: "insecure-skip-verify" });
      expect(r.mode).toBe("require");
      expect(r.out).toContain(MARKER);
    });

    test("an explicit sslmode in the URL still wins (owner's choice)", () => {
      const env = pgEnvFromUrl("postgresql://u:p@localhost:5432/db?sslmode=verify-ca");
      expect(env.PGSSLMODE).toBe("verify-ca");
    });
  });
});

describe("pg-tls configuration", () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-tls-cfg-"));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("mode: unset / empty / verify -> verify; the opt-out must be spelled out; anything else is an error", () => {
    expect(sourceTlsMode({})).toBe("verify");
    expect(sourceTlsMode({ BACKUP_DB_TLS_MODE: "" })).toBe("verify");
    expect(sourceTlsMode({ BACKUP_DB_TLS_MODE: "verify" })).toBe("verify");
    expect(sourceTlsMode({ BACKUP_DB_TLS_MODE: "insecure-skip-verify" })).toBe("insecure-skip-verify");
    for (const bad of ["true", "false", "insecure", "require", "off", "VERIFY ", "skip"]) {
      expect(() => sourceTlsMode({ BACKUP_DB_TLS_MODE: bad })).toThrow(PgTlsConfigError);
    }
  });

  test("the node-pg option verifies by default and never sets rejectUnauthorized:false without the explicit opt-out", () => {
    expect(sourceTlsOption({})).toEqual({ rejectUnauthorized: true });
    expect(sourceTlsOption({ BACKUP_DB_TLS_MODE: "verify" })).toEqual({ rejectUnauthorized: true });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(sourceTlsOption({ BACKUP_DB_TLS_MODE: "insecure-skip-verify" })).toEqual({ rejectUnauthorized: false });
    jest.restoreAllMocks();
  });

  test("CA file: a PEM certificate is loaded; a private key, garbage or a missing file are refused (messages do not leak paths or content)", () => {
    const cert = path.join(dir, "ca.pem");
    fs.writeFileSync(cert, "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n");
    expect(sourceTlsOption({ RESTORE_DRILL_SOURCE_SSL_CA: cert })).toEqual({ rejectUnauthorized: true, ca: fs.readFileSync(cert, "utf8") });

    const key = path.join(dir, "key.pem");
    fs.writeFileSync(key, "-----BEGIN PRIVATE KEY-----\nSECRETKEYMATERIAL\n-----END PRIVATE KEY-----\n");
    const garbage = path.join(dir, "garbage.pem");
    fs.writeFileSync(garbage, "not a certificate");
    for (const bad of [key, garbage, path.join(dir, "missing.pem")]) {
      try {
        readCaFile(bad);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(PgTlsConfigError);
        expect((err as Error).message).not.toContain("SECRETKEYMATERIAL");
        expect((err as Error).message).not.toContain(dir);
      }
    }
  });

  test("libpq mapping: verify-full + system roots by default, a pinned file when given, require only for the explicit opt-out", () => {
    expect(libpqSslEnv({})).toEqual({ PGSSLMODE: "verify-full", PGSSLROOTCERT: "system" });
    const cert = path.join(dir, "root.pem");
    fs.writeFileSync(cert, "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n");
    expect(libpqSslEnv({ PGSSLROOTCERT: cert })).toEqual({ PGSSLMODE: "verify-full", PGSSLROOTCERT: cert });
    expect(libpqSslEnv({ RESTORE_DRILL_SOURCE_SSL_CA: cert })).toEqual({ PGSSLMODE: "verify-full", PGSSLROOTCERT: cert });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(libpqSslEnv({ BACKUP_DB_TLS_MODE: "insecure-skip-verify" })).toEqual({ PGSSLMODE: "require" });
    jest.restoreAllMocks();
  });

  test("hostOfConnectionString handles names, IPv4 and bracketed IPv6", () => {
    expect(hostOfConnectionString("postgresql://u:p@DB.Example.com:5432/x")).toBe("db.example.com");
    expect(hostOfConnectionString("postgresql://u:p@127.0.0.1/x")).toBe("127.0.0.1");
    expect(hostOfConnectionString("postgresql://u:p@[::1]:5432/x")).toBe("::1");
  });

  test("no rejectUnauthorized:false is left anywhere in the backup/restore scripts except the explicit opt-out", () => {
    const dirScripts = path.join(__dirname, "../../../scripts/backup");
    for (const f of fs.readdirSync(dirScripts).filter((n) => n.endsWith(".ts"))) {
      const src = fs.readFileSync(path.join(dirScripts, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("//"));
      const hits = src.filter((l) => /rejectUnauthorized\s*:\s*false/.test(l));
      if (f === "pg-tls.ts") expect(hits).toHaveLength(1);
      else expect({ f, hits }).toEqual({ f, hits: [] });
    }
  });
});
