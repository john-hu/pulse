import fs from 'fs';
import path from 'path';
import os from 'os';
import dayjs from 'dayjs';
import { execChildCommand } from './child_process';
import { createStorage, Commit, Record, StorageType, Storage } from './storages';
import git from './git';

type DailyCommit = {
  date: dayjs.Dayjs;
  commit?: Commit;
  shadow: boolean;
};

type ClocOptions = {
  fileList?: string;
  excludeDir?: string;
  excludeLang?: string;
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
      await git.update(projectFolder, this.mainBranch);
    } else {
      console.log(`Folder ${folderName} is not exist, clone it`);
      await git.clone(repo, folderName, this.baseFolder);
    }
  }

  private async listDailyCommits(
    folderName: string,
    projectFolder: string,
    since?: string
  ): Promise<DailyCommit[]> {
    const commits: Commit[] = await git.log('%aI %h %ae', folderName, projectFolder, since);
    let currentDate: dayjs.Dayjs | null = null;
    // build dialy commits
    return commits
      // git log list commits based on merge time. We need to list on commit time. For example:
      // We have a commit at March 8th which is merged at March 14th. When we make a query with
      // March 11th, the commit at March 8th won't show up. But when we makr a query with March
      // 14th, it shows up. We need to filter them out.
      // TODO: there may be an issue that we lost the commits which is not merged today.
      // TODO: We should fix it. Fortunately, the data catches up in the commit after merged date.
      .filter((commit) => (since ? commit.dateTime >= since : true))
      .reduce<DailyCommit[]>((acc, commit) => {
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
  }

  async clocAll(folderName: string, options?: ClocOptions): Promise<void> {
    let lastRecords: Record[] = await this.storage!.getLastRecords(folderName);
    const projectFolder = path.join(this.baseFolder, folderName);
    let since: string | undefined = undefined;
    if (lastRecords.length > 0) {
      console.log(`Previous records found, last date: ${lastRecords[0].dateTime}`);
      since = lastRecords[0].dateTime;
    }
    const dailyCommits = await this.listDailyCommits(folderName, projectFolder, since);
    if (dailyCommits.length === 0) {
      // no commits => no jobs.
      return;
    }
    if (lastRecords.length > 0) {
      let catchUpDate: dayjs.Dayjs = dayjs(lastRecords[0].dateTime).add(1, 'd');
      console.log(
        `Try to catch up from ${catchUpDate.toISOString()} to ${dailyCommits[0].date.toISOString()}`
      );
      // catch up the dates between lastRecords and dailyCommits, for example:
      // lastRecord is at March 13th, the dailyCommit starts from March 16th. We should rebuild
      // March 14th, which is lastRecord.date + 1d, and March 15th.
      while (dailyCommits[0].date.diff(catchUpDate, 'd') > 0) {
        console.log(`catch up date => ${catchUpDate.toISOString()}`);
        const redated = lastRecords.map((record) => ({
          ...record,
          dateTime: catchUpDate.toISOString(),
        }));
        await this.putRecords(redated);
        catchUpDate = catchUpDate.add(1, 'd');
      }
    }
    // cloc everyday
    for (const dailyCommit of dailyCommits) {
      if (dailyCommit.shadow) {
        console.log(`cloc ${dailyCommit.date.format('YYYY-MM-DD')} => shadow`);
        // shadow records, just clone the previous one and save.
        const redated = lastRecords.map((record) => ({
          ...record,
          dateTime: dailyCommit.date.toISOString(),
        }));
        await this.putRecords(redated);
      } else {
        // checkout and calcuate
        console.log(
          `cloc ${dailyCommit.date.format('YYYY-MM-DD')} => ${dailyCommit.commit!.shortHash}`
        );
        await git.checkout(dailyCommit.commit!.shortHash, projectFolder);
        lastRecords = await this.cloc(folderName, options, dailyCommit.date.toISOString());
      }
    }
    // checkout back to the main branch
    await git.checkout(this.mainBranch, projectFolder);
  }

  async cloc(folderName: string, options?: ClocOptions, dateTime?: string): Promise<Record[]> {
    const jsonPath = path.join(this.tempFolder, 'cloc.json');
    const listFile = !options?.fileList ? ' .' : ` --list-file="${options.fileList}"`;
    const excludeDir = options?.excludeDir ? ` --exclude-dir="${options.excludeDir}"` : '';
    const excludeLang = options?.excludeLang ? ` --exclude-lang="${options.excludeLang}"` : '';
    await execChildCommand(
      `"${process.env.CLOC}"${listFile}${excludeDir}${excludeLang} --json --out="${jsonPath}"`,
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
