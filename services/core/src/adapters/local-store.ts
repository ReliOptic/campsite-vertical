import { mkdir, readFile, writeFile, stat, rm, readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { ObjectStore, StoredObject } from '../ports';

export class MemoryStore implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();
  async put(key: string, body: Uint8Array, contentType?: string) { this.objects.set(key, { body: new Uint8Array(body), size: body.byteLength, contentType }); }
  async get(key: string) { return this.objects.get(key) ?? null; }
  async head(key: string) { const o = this.objects.get(key); return o ? { size: o.size } : null; }
  async delete(key: string) { this.objects.delete(key); }
  async list(prefix: string) { return [...this.objects.keys()].filter(k => k.startsWith(prefix)).sort(); }
}

/** File-backed object store for local runs (keys map to files under root). */
export class FsStore implements ObjectStore {
  constructor(private readonly root: string) {}
  private pathFor(key: string) {
    if (key.split('/').some(s => s === '..' || s === '')) throw new Error('invalid key');
    return join(this.root, ...key.split('/'));
  }
  async put(key: string, body: Uint8Array, contentType?: string) {
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
    if (contentType) await writeFile(p + '.ct', contentType);
  }
  async get(key: string): Promise<StoredObject | null> {
    try {
      const p = this.pathFor(key);
      const body = new Uint8Array(await readFile(p));
      let contentType: string | undefined;
      try { contentType = await readFile(p + '.ct', 'utf8'); } catch { /* none */ }
      return { body, size: body.byteLength, contentType };
    } catch { return null; }
  }
  async head(key: string) { try { return { size: (await stat(this.pathFor(key))).size }; } catch { return null; } }
  async delete(key: string) { await rm(this.pathFor(key), { force: true }); await rm(this.pathFor(key) + '.ct', { force: true }); }
  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string) => {
      let entries: import('node:fs').Dirent[];
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (!e.name.endsWith('.ct')) out.push(relative(this.root, full).split(sep).join('/'));
      }
    };
    await walk(this.root);
    return out.filter(k => k.startsWith(prefix)).sort();
  }
}
