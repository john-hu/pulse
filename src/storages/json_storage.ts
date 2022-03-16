import { promises as fs } from 'fs';
import { Record, Storage, StorageType } from './types';

export class JSONStorage implements Storage {
  path: string = '';
  type: StorageType = StorageType.JSON;

  async init(path: string): Promise<void> {
    this.path = path;
  }

  async putRecords(records: Record[]): Promise<void> {
    let existing: Record[] = [];
    try {
      const jsonContent = await fs.readFile(this.path, { encoding: 'utf8' });
      existing = JSON.parse(jsonContent) as Record[];
    } catch (ex: any) {
      if (ex.code !== 'ENOENT') {
        console.warn('error while loading and parsing json file: ', ex);
      }
    }
    await fs.writeFile(this.path, JSON.stringify([...existing, ...records]), { encoding: 'utf8' });
  }
}
