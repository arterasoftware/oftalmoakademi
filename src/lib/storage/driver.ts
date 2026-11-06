import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Depolama sürücüsü arayüzü. Dosyalar ASLA public/ altında tutulmaz;
 * yalnızca yetkili /api/dosya/[id] rotası üzerinden akıtılır.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  private root = path.join(process.cwd(), "data", "storage");
  private resolve(key: string) {
    const p = path.normalize(path.join(this.root, key));
    if (!p.startsWith(this.root + path.sep)) throw new Error("Geçersiz depolama anahtarı");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
    await fs.writeFile(p, data, { mode: 0o600 });
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

/** S3 uyumlu (AWS S3, MinIO, Cloudflare R2). AWS SDK isteğe bağlı bağımlılıktır. */
class S3Driver implements StorageDriver {
  private clientPromise: Promise<{
    send: (cmd: unknown) => Promise<{ Body?: { transformToByteArray: () => Promise<Uint8Array> } }>;
  }> | null = null;
  private cmds: Promise<{
    PutObjectCommand: new (i: Record<string, unknown>) => unknown;
    GetObjectCommand: new (i: Record<string, unknown>) => unknown;
    DeleteObjectCommand: new (i: Record<string, unknown>) => unknown;
  }> | null = null;

  private async client() {
    if (!this.clientPromise) {
      const modName = "@aws-sdk/client-s3";
      this.cmds = import(/* webpackIgnore: true */ modName) as never;
      this.clientPromise = (async () => {
        const m = (await this.cmds!) as unknown as { S3Client: new (o: Record<string, unknown>) => never };
        const e = env();
        return new m.S3Client({
          region: e.S3_REGION || "auto",
          endpoint: e.S3_ENDPOINT || undefined,
          forcePathStyle: Boolean(e.S3_ENDPOINT),
          credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
        });
      })();
    }
    return this.clientPromise;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const c = await this.client();
    const { PutObjectCommand } = await this.cmds!;
    await c.send(new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: data, ContentType: contentType, ServerSideEncryption: "AES256" }));
  }
  async get(key: string) {
    const c = await this.client();
    const { GetObjectCommand } = await this.cmds!;
    const r = await c.send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
    if (!r.Body) throw new Error("Boş nesne");
    return Buffer.from(await r.Body.transformToByteArray());
  }
  async delete(key: string) {
    const c = await this.client();
    const { DeleteObjectCommand } = await this.cmds!;
    await c.send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!driver) driver = env().STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver();
  return driver;
}
