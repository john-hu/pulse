import { Storage, StorageType } from './types';
import { JSONStorage } from './json_storage';
import { SQLiteStorage } from './sqlite_storage';

export { JSONStorage } from './json_storage';
export { SQLiteStorage } from './sqlite_storage';
export * from './types';

export const createStorage = async (type: StorageType, storagePath: string): Promise<Storage> => {
  let storage: Storage;
  switch (type) {
    case StorageType.SQLite:
      storage = new SQLiteStorage();
      break;
    case StorageType.JSON:
      storage = new JSONStorage();
      break;
    default:
      throw new Error(`Unsupported type ${type}`);
  }
  await storage.init(storagePath);
  return storage;
};
