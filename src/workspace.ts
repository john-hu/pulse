import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PromisedDatabase as Database } from 'promised-sqlite3';
import { execChildCommand } from './child_process';

const CREATE_MAIN_TABLE = `
CREATE TABLE IF NOT EXISTS ClocRecords(
  dateTime TEXT,
  project TEXT,
  language TEXT,
  fileCount INTEGER,
  blankLines INTEGER,
  commentLines INTEGER,
  codeLines INTEGER
);
`;

export class Workspace {
  baseFolder: string = '.';
  databaseFile: string = ':memory:';
  constructor(base: string) {
    this.baseFolder = base;
    this.databaseFile = path.join(this.baseFolder, 'data.db');
  }

  async init(): Promise<void> {
    fs.promises.mkdir(this.baseFolder, { recursive: true });
    const db = new Database();
    await db.open(this.databaseFile);
    await db.run(CREATE_MAIN_TABLE);
    await db.close();
  }

  async syncRepo(repo: string, folderName: string): Promise<void> {
    // TODO check the syntax of repo and folder.
    let cloned = false;
    // check if the git cloned exists or not
    try {
      await fs.promises.access(
        path.join(this.baseFolder, folderName, '.git', 'config'),
        fs.constants.R_OK | fs.constants.W_OK
      );
      cloned = true;
    } catch (ex) {
      cloned = false;
    }
    if (cloned) {
      console.log(`Folder ${folderName} exist, update it`);
      await execChildCommand('git pull', path.join(this.baseFolder, folderName));
    } else {
      console.log(`Folder ${folderName} is not exist, clone it`);
      await execChildCommand(`git clone "${repo}" "${folderName}"`, this.baseFolder);
    }
  }

  async cloc(folderName: string, fileList?: string): Promise<void> {
    const tmpFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pulse-'));
    const jsonPath = path.join(tmpFolder, 'cloc.json');
    const listFile = !fileList ? ' .' : ` --list-file="${fileList}"`;
    await execChildCommand(
      `"${process.env.CLOC}"${listFile} --json --out="${jsonPath}"`,
      path.join(this.baseFolder, folderName)
    );
    // load the result back
    const jsonContent = await fs.promises.readFile(jsonPath, { encoding: 'utf8' });
    const clocData = JSON.parse(jsonContent);
    const keys = Object.keys(clocData);

    const db = new Database();
    await db.open(this.databaseFile);
    await db.run('BEGIN TRANSACTION;');
    const now: string = new Date().toISOString();
    try {
      for (const language of keys) {
        if (['header', 'SUM'].indexOf(language) > -1) {
          continue;
        }
        const languageResult = clocData[language];
        await db.run(
          `INSERT INTO
          ClocRecords(dateTime, project, language, fileCount, blankLines, commentLines, codeLines)
          VALUES(?, ?, ?, ?, ?, ?, ?);`,
          now,
          folderName,
          language,
          languageResult.nFiles,
          languageResult.blank,
          languageResult.comment,
          languageResult.code
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
