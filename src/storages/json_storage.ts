import { promises as fs } from 'fs';
import { Record, StorageType } from './types';
import { BaseStorage } from './base_storage';

const BUFFER_SIZE = 500;

export class JSONStorage extends BaseStorage {
  path: string = '';
  type: StorageType = StorageType.JSON;

  async init(path: string): Promise<void> {
    this.path = path;
  }

  protected async flushBuffer(): Promise<void> {
    let existing: Record[] = [];
    try {
      const jsonContent = await fs.readFile(this.path, { encoding: 'utf8' });
      existing = JSON.parse(jsonContent) as Record[];
    } catch (ex) {
      const nodeEx: NodeJS.ErrnoException = ex as NodeJS.ErrnoException;
      if (nodeEx.code !== 'ENOENT') {
        console.warn('error while loading and parsing json file: ', ex);
      }
    }
    await fs.writeFile(this.path, JSON.stringify([...existing, ...this.buffers]), {
      encoding: 'utf8',
    });
  }
}
