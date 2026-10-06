import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import type { Env } from '../config/env.js';

/**
 * The only place that touches the file system for app data.
 * All paths passed in and returned are RELATIVE keys (e.g. "papers/9702_s26_11/qp.pdf"),
 * so swapping local disk for S3/R2 later only means re-implementing this class.
 */
@Injectable()
export class StorageService {
  readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('STORAGE_ROOT', { infer: true }));
  }

  async init(): Promise<void> {
    await mkdir(join(this.root, 'papers'), { recursive: true });
  }

  /** Resolve a relative key to an absolute path, refusing anything outside the root. */
  absolute(key: string): string {
    if (isAbsolute(key)) throw new Error(`Storage key must be relative: ${key}`);
    const full = resolve(this.root, normalize(key));
    const rel = relative(this.root, full);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Storage key escapes root: ${key}`);
    return full;
  }

  exists(key: string): boolean {
    return existsSync(this.absolute(key));
  }

  async write(key: string, data: Buffer | string): Promise<void> {
    const full = this.absolute(key);
    await mkdir(dirname(full), { recursive: true });
    // Write to a temp file then rename, so readers never see a half-written file.
    const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, full);
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.absolute(key));
  }

  async writeJson(key: string, value: unknown): Promise<void> {
    await this.write(key, JSON.stringify(value, null, 2));
  }

  async readJson<T>(key: string): Promise<T | null> {
    if (!this.exists(key)) return null;
    return JSON.parse((await this.read(key)).toString('utf8')) as T;
  }

  async listDirs(key: string): Promise<string[]> {
    if (!this.exists(key)) return [];
    const entries = await readdir(this.absolute(key), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  async removeDir(key: string): Promise<void> {
    await rm(this.absolute(key), { recursive: true, force: true });
  }
}
