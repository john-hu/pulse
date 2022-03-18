import { PromisedDatabase as Database } from 'promised-sqlite3';
import { Record, StorageType } from './types';
import { BaseStorage } from './base_storage';

const CREATE_MAIN_TABLE = `
CREATE TABLE IF NOT EXISTS ClocRecords(
  dateTime TEXT,
  project TEXT,
  language TEXT,
  fileCount INTEGER,
  blankLines INTEGER,
  commentLines INTEGER,
  codeLines INTEGER,
  PRIMARY KEY (dateTime, project, language)
);
`;

export class SQLiteStorage extends BaseStorage {
  path: string = '';
  type: StorageType = StorageType.SQLite;

  async init(path: string): Promise<void> {
    this.path = path;
    const db = new Database();
    await db.open(this.path);
    await db.run(CREATE_MAIN_TABLE);
    await db.close();
  }

  async getLastRecords(project: string): Promise<Record[]> {
    const db = new Database();
    await db.open(this.path);
    try {
      const lastDateTime: { dateTime: string } = await db.get(
        'SELECT dateTime FROM ClocRecords WHERE project = ? ORDER BY dateTime DESC LIMIT 1',
        project
      );
      const result = (await db.all(
        `SELECT dateTime, project, language, fileCount, blankLines, commentLines, codeLines
          FROM ClocRecords
          WHERE dateTime = ? AND project = ?
          ORDER BY dateTime DESC`,
        [lastDateTime.dateTime, project]
      )) as Record[];
      return result;
    } finally {
      await db.close();
    }
  }

  protected async flushBuffer(): Promise<void> {
    const db = new Database();
    await db.open(this.path);
    await db.run('BEGIN TRANSACTION;');
    try {
      for (const record of this.buffers) {
        await db.run(
          `INSERT INTO
          ClocRecords(dateTime, project, language, fileCount, blankLines, commentLines, codeLines)
          VALUES(?, ?, ?, ?, ?, ?, ?);`,
          record.dateTime,
          record.project,
          record.language,
          record.fileCount,
          record.blankLines,
          record.commentLines,
          record.codeLines
        );
      }
      await db.run('COMMIT;');
    } catch (ex) {
      await db.run('ROLLBACK;');
      throw ex;
    } finally {
      await db.close();
    }
  }
}
