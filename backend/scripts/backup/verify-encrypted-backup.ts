import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { verifyDumpReadable } from "./backup-verify";

// مسار التحقق من النسخة المشفّرة (*.dump.gpg): البصمة الأول، وبعدين فك التشفير - مش العكس.
//   * بيقارن SHA-256 للملف المشفّر نفسه بملف البصمة (<file>.sha256) - تعديل بايت واحد (تلف تخزين/تحميل/عبث) بيفشل هنا
//     قبل ما حد يمرّر الملف لـgpg أو pg_restore.
//   * بيرفض ملف dump غير مشفّر (يبدأ بـPGDMP) متسمّي .gpg.
//   * فك التشفير (--decrypt-to) مش بيحصل إلا بعد نجاح البصمة، والـpassphrase بتتقري من متغير بيئة أو stdin ومبتتبعتش
//     أبدًا في سطر أوامر، ومبتتطبعش. ملف الناتج بيتكتب بصلاحيات 0600 وبيتمسح لو فك التشفير فشل (gpg بيفحص MDC فبيكشف
//     التعديل حتى لو حد أعاد حساب البصمة).
// مفيش dotenv هنا عمدًا: أسرار الإنتاج مبتتقراش من ملفات .env.
export class EncryptedBackupIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptedBackupIntegrityError";
  }
}

const PLAINTEXT_DUMP_MAGIC = Buffer.from("PGDMP");
const SIDECAR_LINE = /^([0-9a-fA-F]{64}) [ *](.+)$/;

export function sha256OfFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    fs.createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

export function parseChecksumSidecar(text: string, expectedName: string): string {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length !== 1) throw new EncryptedBackupIntegrityError("checksum file must contain exactly one line (sha256sum format)");
  const m = SIDECAR_LINE.exec(lines[0].trimEnd());
  if (!m) throw new EncryptedBackupIntegrityError("checksum file is not in sha256sum format");
  if (m[2] !== expectedName) throw new EncryptedBackupIntegrityError("checksum file belongs to a different file name");
  return m[1].toLowerCase();
}

export async function verifyEncryptedBackup(file: string): Promise<{ sha256: string; bytes: number }> {
  const name = path.basename(file);
  if (!name.endsWith(".dump.gpg")) throw new EncryptedBackupIntegrityError("expected an encrypted backup named *.dump.gpg");
  if (!fs.existsSync(file)) throw new EncryptedBackupIntegrityError("encrypted backup file not found");
  const sidecar = `${file}.sha256`;
  if (!fs.existsSync(sidecar)) throw new EncryptedBackupIntegrityError("checksum file (.sha256) is missing - refusing to trust an unverified backup");

  const bytes = fs.statSync(file).size;
  if (bytes === 0) throw new EncryptedBackupIntegrityError("encrypted backup is empty");
  const head = Buffer.alloc(PLAINTEXT_DUMP_MAGIC.length);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, head, 0, head.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (head.equals(PLAINTEXT_DUMP_MAGIC)) throw new EncryptedBackupIntegrityError("file is a PLAINTEXT pg_dump archive, not an encrypted backup");

  const expected = parseChecksumSidecar(fs.readFileSync(sidecar, "utf8"), name);
  const actual = await sha256OfFile(file);
  if (actual !== expected) {
    throw new EncryptedBackupIntegrityError(`SHA-256 mismatch: file ${actual.slice(0, 16)}… != recorded ${expected.slice(0, 16)}… - the backup is corrupted or was modified`);
  }
  return { sha256: actual, bytes };
}

// بيفك التشفير بعد نجاح البصمة. الناتج plaintext كامل (بيانات عملاء/رواتب/باسوردات مجزأة): خزّنه على قرص مشفّر وامسحه بعد الاستخدام
export async function decryptVerifiedBackup(
  file: string,
  outFile: string,
  passphrase: string,
  opts: { verifyDump?: boolean } = {}
): Promise<void> {
  await verifyEncryptedBackup(file); // البصمة الأول - دايمًا
  if (passphrase.length < 32) throw new EncryptedBackupIntegrityError("passphrase is shorter than the 32 characters the backup workflow requires");

  const outFd = fs.openSync(outFile, "wx", 0o600); // مش بيكتب فوق ملف موجود
  let failure: string | null = null;
  try {
    failure = await new Promise<string | null>((resolve) => {
      const child = spawn("gpg", ["--batch", "--no-tty", "--pinentry-mode", "loopback", "--passphrase-fd", "3", "--decrypt", file], {
        stdio: ["ignore", outFd, "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr!.on("data", (d) => (stderr += d.toString()));
      child.on("error", (err) => resolve(`could not run gpg: ${err.message}`));
      child.on("close", (code) => resolve(code === 0 ? null : `gpg failed (exit ${code}): ${stderr.trim().split("\n").slice(-3).join(" | ")}`));
      const pass = child.stdio[3] as NodeJS.WritableStream;
      pass.on("error", () => undefined);
      pass.end(passphrase);
    });
  } finally {
    fs.closeSync(outFd);
  }
  if (failure) {
    fs.rmSync(outFile, { force: true }); // مش بنسيب plaintext جزئي
    throw new EncryptedBackupIntegrityError(failure);
  }
  if (opts.verifyDump !== false) {
    try {
      await verifyDumpReadable(outFile);
    } catch (err) {
      fs.rmSync(outFile, { force: true });
      throw err;
    }
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  const args = process.argv.slice(2);
  const decryptIdx = args.indexOf("--decrypt-to");
  const outFile = decryptIdx >= 0 ? args[decryptIdx + 1] : undefined;
  const useStdin = args.includes("--passphrase-stdin");
  const files = args.filter((a, i) => !a.startsWith("--") && !(decryptIdx >= 0 && i === decryptIdx + 1));
  if (files.length === 0) throw new Error("usage: verify-encrypted-backup <file.dump.gpg>... [--decrypt-to <out.dump> [--passphrase-stdin]]");
  if (outFile && files.length !== 1) throw new Error("--decrypt-to works on exactly one file");

  for (const file of files) {
    const v = await verifyEncryptedBackup(file);
    console.log(`OK checksum: ${path.basename(file)} (${v.bytes} bytes, sha256=${v.sha256.slice(0, 16)}…)`);
  }
  if (outFile) {
    const passphrase = useStdin ? await readStdin() : process.env.BACKUP_ENCRYPTION_KEY;
    if (!passphrase) throw new Error("no passphrase: set BACKUP_ENCRYPTION_KEY in this shell or pass --passphrase-stdin");
    await decryptVerifiedBackup(files[0], outFile, passphrase);
    console.log(`OK decrypted + readable by pg_restore -> ${outFile} (permissions 0600; delete it after use)`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
