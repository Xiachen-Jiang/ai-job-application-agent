import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export function sanitizeFolderSegment(value: string, maxLen = 50): string {
  return value
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "")
    .slice(0, maxLen) || "Unknown";
}

export function buildApplicationFolderName(company: string, title: string, suffix?: string): string {
  const base = `${sanitizeFolderSegment(company)}_${sanitizeFolderSegment(title)}`;
  return suffix ? `${base}_${suffix}` : base;
}

export interface StorageProvider {
  getApplicationDir(company: string, title: string, conflictSuffix?: string): Promise<string>;
  writeFile(relativePath: string, content: Buffer): Promise<string>;
  readFile(relativePath: string): Promise<Buffer>;
  ensureDir(relativeDir: string): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
  constructor(private root: string) {}

  private resolve(relativePath: string): string {
    return path.join(this.root, relativePath);
  }

  async ensureDir(relativeDir: string): Promise<void> {
    await fs.mkdir(this.resolve(relativeDir), { recursive: true });
  }

  async getApplicationDir(company: string, title: string, conflictSuffix?: string): Promise<string> {
    const folder = buildApplicationFolderName(company, title, conflictSuffix);
    const relativeDir = path.join("applications", folder);
    await this.ensureDir(relativeDir);
    return relativeDir;
  }

  async writeFile(relativePath: string, content: Buffer): Promise<string> {
    const fullPath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
    return relativePath;
  }

  async readFile(relativePath: string): Promise<Buffer> {
    return fs.readFile(this.resolve(relativePath));
  }
}

export function getStorage(): LocalStorageProvider {
  const monorepoRoot = path.resolve(__dirname, "../../..");
  const configured = process.env.STORAGE_ROOT;
  const root = configured
    ? path.isAbsolute(configured)
      ? configured
      : path.join(monorepoRoot, configured.replace(/^\.\//, ""))
    : path.join(monorepoRoot, "storage");
  return new LocalStorageProvider(root);
}

export function hashDescription(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}
