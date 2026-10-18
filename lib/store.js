// Tiny JSON-file store with atomic writes. Zero dependencies.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { desks: {} };
    if (file && existsSync(file)) this.data = JSON.parse(readFileSync(file, 'utf8'));
  }
  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
  desk(id) { return this.data.desks[id]; }
  findStamp(stamp) {
    for (const d of Object.values(this.data.desks)) {
      const p = d.pieces.find((x) => x.stamp === stamp);
      if (p) return { desk: d, piece: p };
    }
    return null;
  }
}
