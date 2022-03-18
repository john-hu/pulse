import { promises as fs } from 'fs';
import { Record, StorageType } from './types';
import { BaseStorage } from './base_storage';

export class JSONStorage extends BaseStorage {
  path: string = '';
  type: StorageType = StorageType.JSON;

  async init(path: string): Promise<void> {
    this.path = path;
  }

  async getLastRecords(project: string): Promise<Record[]> {
    const existing: Record[] = await this.loadAll();
    const records: Record[] = [];
    let lastDateTime: string = '';
    for (let i = existing.length - 1; i > -1; i++) {
      if (existing[i].project !== project) {
        continue;
      }
      if (!lastDateTime) {
        lastDateTime = existing[i].dateTime;
      }
      if (existing[i].dateTime === lastDateTime) {
        records.unshift(existing[i]);
      }
    }
    return records;
  }

  private async loadAll(): Promise<Record[]> {
    try {
      const jsonContent = await fs.readFile(this.path, { encoding: 'utf8' });
      return JSON.parse(jsonContent) as Record[];
    } catch (ex) {
      const nodeEx: NodeJS.ErrnoException = ex as NodeJS.ErrnoException;
      if (nodeEx.code !== 'ENOENT') {
        console.warn('error while loading and parsing json file: ', ex);
      }
      return []
    }
  }

  protected async flushBuffer(): Promise<void> {
    const existing: Record[] = await this.loadAll();
    await fs.writeFile(this.path, JSON.stringify([...existing, ...this.buffers]), {
      encoding: 'utf8',
    });
  }
}
