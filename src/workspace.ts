import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execChildCommand } from './child_process';
import { createStorage, Record, StorageType } from './storages';

export class Workspace {
  baseFolder: string = '.';
  storageType: StorageType = StorageType.JSON;
  storagePath: string = '';

  constructor(base: string, storageType: StorageType, storagePath: string) {
    this.baseFolder = base;
    this.storageType = storageType;
    this.storagePath = storagePath;
  }

  async init(): Promise<void> {
    await fs.promises.mkdir(this.baseFolder, { recursive: true });
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
    const records: Record[] = keys.reduce<Record[]>((acc, language) => {
      if (['header', 'SUM'].indexOf(language) > -1) {
        return acc;
      }
      const languageResult = clocData[language];
      acc.push({
        project: folderName,
        language,
        fileCount: languageResult.nFiles,
        blankLines: languageResult.blank,
        commentLines: languageResult.comment,
        codeLines: languageResult.code,
      });
      return acc;
    }, []);
    this.putRecords(records);
  }

  async putRecords(records: Record[]): Promise<void> {
    const storage = await createStorage(StorageType.JSON, this.storagePath);
    await storage.putRecords(records);
  }
}
