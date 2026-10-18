/**
 * Content-addressed media storage.
 *
 * Images are stored by the SHA-256 of their bytes, so re-uploading the same file
 * is idempotent and the URL is immutable. The database keeps the listing
 * association and the served content type; the file name alone is never trusted.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import type { MediaAsset } from "../../shared/src/index.ts";
import type { MirrorDb } from "./db.ts";

const CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const FILENAME_PATTERN = /^[0-9a-f]{64}\.(jpg|png|webp|gif|avif)$/;

export class UnsupportedMediaTypeError extends Error {
  constructor(contentType: string) {
    super(`unsupported media type "${contentType}"; use ${Object.keys(CONTENT_TYPES).join(", ")}`);
    this.name = "UnsupportedMediaTypeError";
  }
}

export class MediaStore {
  constructor(
    private readonly dir: string,
    private readonly db: MirrorDb,
    private readonly urlBase = "/media"
  ) {}

  /** Store bytes and associate them with `listing`. Idempotent per file. */
  async put(listing: string, data: Buffer, contentType: string): Promise<MediaAsset> {
    const extension = CONTENT_TYPES[contentType.split(";")[0].trim().toLowerCase()];
    if (!extension) throw new UnsupportedMediaTypeError(contentType);
    if (data.length === 0) throw new Error("empty media body");

    const sha256 = createHash("sha256").update(data).digest("hex");
    const filename = `${sha256}.${extension}`;
    const path = resolve(this.dir, filename);
    if (!path.startsWith(resolve(this.dir) + sep)) {
      throw new Error("media path escaped the storage directory");
    }

    await mkdir(this.dir, { recursive: true });
    await writeFile(path, data, { mode: 0o644 });

    const asset: MediaAsset = {
      id: `${listing}:${sha256}`,
      url: `${this.urlBase}/${filename}`,
      contentType: contentType.split(";")[0].trim().toLowerCase(),
      bytes: data.length,
      sha256,
      createdAt: new Date().toISOString(),
    };
    this.db.putMedia({ ...asset, filename, listing });
    return asset;
  }

  /**
   * Read a stored file by name.
   *
   * Two independent checks: the name must match the content-addressed pattern,
   * and the resolved path must stay inside `dir`. The database lookup is a third
   * (a file that was never recorded is not served), so a traversal attempt cannot
   * reach the filesystem.
   */
  async read(filename: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!FILENAME_PATTERN.test(filename)) return null;
    const record = this.db.mediaByFilename(filename);
    if (!record) return null;

    const path = resolve(this.dir, filename);
    if (!path.startsWith(resolve(this.dir) + sep)) return null;

    try {
      return { data: await readFile(path), contentType: record.content_type };
    } catch {
      return null;
    }
  }

  static isSupported(contentType: string): boolean {
    return Boolean(CONTENT_TYPES[contentType.split(";")[0].trim().toLowerCase()]);
  }

  filePath(filename: string): string {
    return join(this.dir, filename);
  }
}
