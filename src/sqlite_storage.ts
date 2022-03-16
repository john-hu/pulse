import { PromisedDatabase as Database } from 'promised-sqlite3';
import { Record, Storage } from './types';

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

export class SQLiteStorage implements Storage {
  path: string = '';

  async init(path: string): Promise<void> {
    this.path = path;
    const db = new Database();
    await db.open(this.path);
    await db.run(CREATE_MAIN_TABLE);
    await db.close();
  }
  async putRecords(records: Record[]): Promise<void> {
    const db = new Database();
    await db.open(this.path);
    await db.run('BEGIN TRANSACTION;');
    const now: string = new Date().toISOString();
    try {
      for (const record of records) {
        await db.run(
          `INSERT INTO
          ClocRecords(dateTime, project, language, fileCount, blankLines, commentLines, codeLines)
          VALUES(?, ?, ?, ?, ?, ?, ?);`,
          record.dateTime || now,
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