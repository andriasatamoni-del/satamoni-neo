import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  EncryptedBackupIntegrityError,
  decryptVerifiedBackup,
  parseChecksumSidecar,
  verifyEncryptedBackup,
} from "../../../scripts/backup/verify-encrypted-backup";

// Synthetic, NON-sensitive data only: random bytes behind a fake "PGDMP" header. The passphrase is generated per run,
// gpg runs with a throw-away GNUPGHOME (never the user's keyring) and nothing here touches a database or the network.
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("encrypted backup: checksum before decrypt, tamper detection", () => {
  let dir: string;
  let gnupgHome: string;
  let passphrase: string;
  let plain: Buffer;
  let encrypted: string; // satamoni-neo-...dump.gpg
  const savedGnupg = process.env.GNUPGHOME;

  const writeSidecar = (file: string, hash = sha(fs.readFileSync(file))) =>
    fs.writeFileSync(`${file}.sha256`, `${hash}  ${path.basename(file)}\n`);

  beforeAll(() => {
    if (spawnSync("gpg", ["--version"]).status !== 0) throw new Error("gpg is required to run the encrypted-backup tests (it is preinstalled on ubuntu-latest)");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "enc-backup-test-"));
    gnupgHome = path.join(dir, "gnupg");
    fs.mkdirSync(gnupgHome, { mode: 0o700 });
    process.env.GNUPGHOME = gnupgHome;
    passphrase = randomBytes(36).toString("base64"); // 48 chars, generated per run, never printed
    plain = Buffer.concat([Buffer.from("PGDMP"), randomBytes(64 * 1024)]);
  });
  afterAll(() => {
    if (savedGnupg === undefined) delete process.env.GNUPGHOME;
    else process.env.GNUPGHOME = savedGnupg;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    const plainFile = path.join(dir, "satamoni-neo-20261003-010700.dump");
    encrypted = `${plainFile}.gpg`;
    fs.rmSync(encrypted, { force: true });
    fs.writeFileSync(plainFile, plain);
    // same invocation as the workflow
    execFileSync("gpg", ["--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--symmetric", "--cipher-algo", "AES256", "-o", encrypted, plainFile], {
      input: passphrase,
      env: { ...process.env, GNUPGHOME: gnupgHome },
    });
    fs.rmSync(plainFile);
    writeSidecar(encrypted);
  });

  test("the encrypted file is real AES-256 symmetric OpenPGP with integrity protection, and does not contain the plaintext", () => {
    // --list-packets exits non-zero here because we deliberately give it no passphrase (pinentry cancelled); the packet dump is still printed
    const out = spawnSync("gpg", ["--batch", "--no-tty", "--pinentry-mode", "cancel", "--list-packets", encrypted], { env: { ...process.env, GNUPGHOME: gnupgHome }, encoding: "utf8" });
    const text = out.stdout + out.stderr;
    expect(text).toMatch(/symkey enc packet/);
    expect(text).toMatch(/cipher 9/); // 9 = AES-256
    expect(text).toMatch(/mdc_method: 2/); // modification-detection code
    const bytes = fs.readFileSync(encrypted);
    expect(bytes.subarray(0, 5).toString()).not.toBe("PGDMP");
    expect(bytes.includes(plain.subarray(5, 69))).toBe(false);
  });

  test("a good file passes: checksum verified, then decrypts back to exactly the original bytes (file mode 0600)", async () => {
    const v = await verifyEncryptedBackup(encrypted);
    expect(v.sha256).toBe(sha(fs.readFileSync(encrypted)));
    const out = path.join(dir, "restored.dump");
    await decryptVerifiedBackup(encrypted, out, passphrase, { verifyDump: false });
    expect(sha(fs.readFileSync(out))).toBe(sha(plain));
    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
    fs.rmSync(out);
  });

  test("the checksum file is in sha256sum format, so the stock `sha256sum --check` also accepts it", () => {
    const r = spawnSync("sha256sum", ["--check", "--strict", `${path.basename(encrypted)}.sha256`], { cwd: dir, encoding: "utf8" });
    expect(r.status).toBe(0);
  });

  test("flipping ONE bit anywhere in the encrypted file makes the checksum verification fail (first, middle and last byte)", async () => {
    const original = fs.readFileSync(encrypted);
    for (const offset of [0, Math.floor(original.length / 2), original.length - 1]) {
      const tampered = Buffer.from(original);
      tampered[offset] ^= 0x01;
      fs.writeFileSync(encrypted, tampered);
      await expect(verifyEncryptedBackup(encrypted)).rejects.toThrow(/SHA-256 mismatch/);
    }
    fs.writeFileSync(encrypted, original);
    await expect(verifyEncryptedBackup(encrypted)).resolves.toBeDefined();
  });

  test("decryption is refused (and produces no output file) when the checksum does not match: gpg is never run on a modified file", async () => {
    const tampered = Buffer.from(fs.readFileSync(encrypted));
    tampered[Math.floor(tampered.length / 2)] ^= 0x01;
    fs.writeFileSync(encrypted, tampered);
    const out = path.join(dir, "must-not-exist.dump");
    await expect(decryptVerifiedBackup(encrypted, out, passphrase, { verifyDump: false })).rejects.toThrow(/SHA-256 mismatch/);
    expect(fs.existsSync(out)).toBe(false);
  });

  test("even if an attacker RECOMPUTES the checksum, gpg's integrity check rejects the modified ciphertext and no plaintext is left behind", async () => {
    const tampered = Buffer.from(fs.readFileSync(encrypted));
    tampered[Math.floor(tampered.length / 2)] ^= 0x01;
    fs.writeFileSync(encrypted, tampered);
    writeSidecar(encrypted); // consistent with the tampered bytes
    await expect(verifyEncryptedBackup(encrypted)).resolves.toBeDefined(); // checksum alone cannot catch this...
    const out = path.join(dir, "must-not-exist-2.dump");
    await expect(decryptVerifiedBackup(encrypted, out, passphrase, { verifyDump: false })).rejects.toThrow(/gpg failed/); // ...the AEAD/MDC check does
    expect(fs.existsSync(out)).toBe(false);
  });

  test("a wrong passphrase fails closed with no output file", async () => {
    const out = path.join(dir, "wrong-pass.dump");
    await expect(decryptVerifiedBackup(encrypted, out, randomBytes(36).toString("base64"), { verifyDump: false })).rejects.toThrow(/gpg failed/);
    expect(fs.existsSync(out)).toBe(false);
  });

  test("a short passphrase is refused up front (the workflow requires 32+ characters)", async () => {
    await expect(decryptVerifiedBackup(encrypted, path.join(dir, "short.dump"), "too-short", { verifyDump: false })).rejects.toThrow(/32 characters/);
  });

  test("a missing, malformed, foreign or truncated checksum file is refused (an unverified backup is never trusted)", async () => {
    const sidecar = `${encrypted}.sha256`;
    fs.rmSync(sidecar);
    await expect(verifyEncryptedBackup(encrypted)).rejects.toThrow(/checksum file .* missing/);

    fs.writeFileSync(sidecar, "not a checksum\n");
    await expect(verifyEncryptedBackup(encrypted)).rejects.toThrow(/sha256sum format/);

    fs.writeFileSync(sidecar, `${sha(fs.readFileSync(encrypted))}  some-other-file.dump.gpg\n`);
    await expect(verifyEncryptedBackup(encrypted)).rejects.toThrow(/different file name/);

    fs.writeFileSync(sidecar, `${sha(fs.readFileSync(encrypted))}  ${path.basename(encrypted)}\n${"0".repeat(64)}  x\n`);
    await expect(verifyEncryptedBackup(encrypted)).rejects.toThrow(/exactly one line/);

    fs.writeFileSync(sidecar, `${"0".repeat(64)}  ${path.basename(encrypted)}\n`);
    await expect(verifyEncryptedBackup(encrypted)).rejects.toThrow(/SHA-256 mismatch/);

    const bytes = fs.readFileSync(encrypted);
    writeSidecar(encrypted); // checksum of the ORIGINAL
    fs.writeFileSync(encrypted, bytes.subarray(0, bytes.length - 1)); // truncated by one byte
    await expect(verifyEncryptedBackup(encrypted)).rejects.toThrow(/SHA-256 mismatch/);
  });

  test("a PLAINTEXT dump renamed to .gpg is refused even though its checksum matches", async () => {
    const fake = path.join(dir, "satamoni-neo-20261004-010700.dump.gpg");
    fs.writeFileSync(fake, plain);
    writeSidecar(fake);
    await expect(verifyEncryptedBackup(fake)).rejects.toThrow(/PLAINTEXT/);
  });

  test("wrong extension or empty file are refused", async () => {
    await expect(verifyEncryptedBackup(path.join(dir, "x.dump"))).rejects.toThrow(EncryptedBackupIntegrityError);
    const empty = path.join(dir, "satamoni-neo-20261005-010700.dump.gpg");
    fs.writeFileSync(empty, "");
    writeSidecar(empty);
    await expect(verifyEncryptedBackup(empty)).rejects.toThrow(/empty/);
  });

  test("parseChecksumSidecar accepts sha256sum text/binary markers and rejects look-alikes", () => {
    const h = "a".repeat(64);
    expect(parseChecksumSidecar(`${h}  f.dump.gpg\n`, "f.dump.gpg")).toBe(h);
    expect(parseChecksumSidecar(`${h.toUpperCase()} *f.dump.gpg`, "f.dump.gpg")).toBe(h);
    expect(() => parseChecksumSidecar(`${h.slice(1)}  f.dump.gpg`, "f.dump.gpg")).toThrow();
    expect(() => parseChecksumSidecar(`${h}  ../f.dump.gpg`, "f.dump.gpg")).toThrow();
  });

  test("CLI: verifies the checksum, exits 1 on a one-byte change, and never prints the passphrase", () => {
    const backendDir = path.join(__dirname, "../../..");
    const env = { PATH: process.env.PATH ?? "", HOME: dir, GNUPGHOME: gnupgHome, TS_NODE_PROJECT: path.join(backendDir, "tsconfig.json"), TS_NODE_TRANSPILE_ONLY: "true" };
    const run = (...args: string[]) => spawnSync(process.execPath, [path.join(backendDir, "node_modules/ts-node/dist/bin.js"), path.join(backendDir, "scripts/backup/verify-encrypted-backup.ts"), ...args], { env, encoding: "utf8", input: passphrase, timeout: 60_000 });

    const ok = run(encrypted);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("OK checksum");

    const out = path.join(dir, "cli-restored.dump");
    const dec = spawnSync(process.execPath, [path.join(backendDir, "node_modules/ts-node/dist/bin.js"), path.join(backendDir, "scripts/backup/verify-encrypted-backup.ts"), encrypted, "--decrypt-to", out, "--passphrase-stdin"], { env, encoding: "utf8", input: passphrase, timeout: 60_000 });
    // the synthetic data is not a real pg_dump, so the final "readable by pg_restore" step is expected to reject it - and remove the output
    expect(dec.status).toBe(1);
    expect(dec.stdout + dec.stderr).not.toContain(passphrase);
    expect(fs.existsSync(out)).toBe(false);

    const bytes = Buffer.from(fs.readFileSync(encrypted));
    bytes[bytes.length - 1] ^= 0x01;
    fs.writeFileSync(encrypted, bytes);
    const bad = run(encrypted);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("SHA-256 mismatch");
  }, 120_000);
});
