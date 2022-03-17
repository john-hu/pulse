import fs from 'fs';
import path from 'path';
import os from 'os';
import dayjs from 'dayjs';
import { execChildCommand } from './child_process';
import { createStorage, Commit, Record, StorageType, Storage } from './storages';

type DailyCommit = {
  date: dayjs.Dayjs;
  commit?: Commit;
  shadow: boolean;
};

export class Workspace {
  baseFolder: string = '.';
  storageType: StorageType = StorageType.JSON;
  storagePath: string = '';
  tempFolder: string = '.tmp';
  mainBranch: string = 'main';
  storage: Storage | null = null;

  constructor(base: string, storageType: StorageType, storagePath: string) {
    this.baseFolder = base;
    this.storageType = storageType;
    this.storagePath = storagePath;
  }

  async init(mainBranch: string): Promise<void> {
    await fs.promises.mkdir(this.baseFolder, { recursive: true });
    this.tempFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pulse-'));
    this.mainBranch = mainBranch;
    this.storage = await createStorage(this.storageType, this.storagePath);
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
      const projectFolder = path.join(this.baseFolder, folderName);
      console.log(`Folder ${folderName} exist, update it`);
      await execChildCommand('git reset --hard', projectFolder);
      await execChildCommand('git clean -fd', projectFolder);
      await execChildCommand(`git checkout ${this.mainBranch}`, projectFolder);
      await execChildCommand('git pull', projectFolder);
    } else {
      console.log(`Folder ${folderName} is not exist, clone it`);
      await execChildCommand(`git clone "${repo}" "${folderName}"`, this.baseFolder);
    }
  }

  async clocAll(folderName: string, fileList?: string, since?: string): Promise<void> {
    const projectFolder = path.join(this.baseFolder, folderName);
    const commitsPath = path.join(this.tempFolder, `${folderName}.commits.list`);
    const sinceArg = since ? ` --since="${since}"` : '';
    await execChildCommand(
      `git log --pretty='format:%aI %h %ae'${sinceArg} > ${commitsPath}`,
      projectFolder,
      false
    );
    const commitsRaw = await fs.promises.readFile(commitsPath, { encoding: 'utf8' });
    // filter empty, convert to Commit and sort in ASC
    const commits: Commit[] = commitsRaw
      .trim()
      .split('\n')
      .filter((line) => !!line && line.indexOf('users.noreply.github.com') === -1)
      .map<Commit>((line) => {
        const splited: string[] = line.split(' ');
        return {
          dateTime: splited[0],
          shortHash: splited[1],
          authorEmail: splited[2],
        };
      })
      .sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime));
    let currentDate: dayjs.Dayjs | null = null;
    // build dialy commits
    const dailyCommits = commits.reduce<DailyCommit[]>((acc, commit) => {
      const commitDate = dayjs(commit.dateTime).startOf('day');
      if (!currentDate) {
        acc.push({ date: commitDate, commit, shadow: false });
        currentDate = commitDate;
      } else {
        const diffDays = commitDate.diff(currentDate, 'day');
        // diffDays > 0 => new date found, need to connect all of them.
        if (diffDays > 0) {
          // loop for middle day
          for (let i = 1; i < diffDays; i++) {
            acc.push({
              date: currentDate.add(i, 'day'),
              shadow: true,
            });
          }
          acc.push({ date: commitDate, commit, shadow: false });
          currentDate = commitDate;
        }
      }
      return acc;
    }, []);
    // cloc everyday
    let lastResult: Record[] = [];
    for (const dailyCommit of dailyCommits) {
      if (dailyCommit.shadow) {
        console.log(`cloc ${dailyCommit.date.format('YYYY-MM-DD')} => shadow`);
        // shadow records, just clone the previous one and save.
        const redated = lastResult.map((record) => ({
          ...record,
          dateTime: dailyCommit.date.toISOString(),
        }));
        await this.putRecords(redated);
      } else {
        // checkout and calcuate
        console.log(
          `cloc ${dailyCommit.date.format('YYYY-MM-DD')} => ${dailyCommit.commit!.shortHash}`
        );
        await execChildCommand(
          `git checkout ${dailyCommit.commit!.shortHash} > /dev/null 2>&1`,
          projectFolder,
          false
        );
        lastResult = await this.cloc(folderName, fileList, dailyCommit.date.toISOString());
      }
    }
    // checkout back to the main branch
    await execChildCommand(
      `git checkout ${this.mainBranch} > /dev/null 2>&1`,
      projectFolder,
      false
    );
  }

  async cloc(folderName: string, fileList?: string, dateTime?: string): Promise<Record[]> {
    const jsonPath = path.join(this.tempFolder, 'cloc.json');
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
        dateTime: dateTime || new Date().toISOString(),
        project: folderName,
        language,
        fileCount: languageResult.nFiles,
        blankLines: languageResult.blank,
        commentLines: languageResult.comment,
        codeLines: languageResult.code,
      });
      return acc;
    }, []);
    await this.putRecords(records);
    return records;
  }

  async putRecords(records: Record[]): Promise<void> {
    await this.storage!.putRecords(records);
  }

  async finalize(): Promise<void> {
    await this.storage!.finalize();
  }
}
