import fs from 'fs';
import os from 'os';
import path from 'path';
import { execChildCommand } from './child_process';
import { Commit } from './storages';

export const clone = async (
  repo: string,
  folderName: string,
  baseFolder: string
): Promise<void> => {
  await execChildCommand(`git clone "${repo}" "${folderName}"`, baseFolder);
};

export const update = async (projectFolder: string, mainBranch: string): Promise<void> => {
  await execChildCommand('git reset --hard', projectFolder);
  await execChildCommand('git clean -fd', projectFolder);
  await execChildCommand(`git checkout ${mainBranch}`, projectFolder);
  await execChildCommand('git pull', projectFolder);
};

export const log = async (
  format: string,
  folderName: string,
  projectFolder: string,
  since?: string
): Promise<Commit[]> => {
  const tempFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pulse-'));
  const commitsPath = path.join(tempFolder, `${folderName}.commits.list`);
  const sinceArg = since ? ` --since="${since}"` : '';
  await execChildCommand(
    `git log --pretty='format:${format}'${sinceArg} > ${commitsPath}`,
    projectFolder,
    false
  );
  const commitsRaw = await fs.promises.readFile(commitsPath, { encoding: 'utf8' });
  return commitsRaw
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
};

export const checkout = async (branch: string, projectFolder: string): Promise<void> => {
  await execChildCommand(`git checkout ${branch} > /dev/null 2>&1`, projectFolder, false);
};

export default { clone, update, log, checkout };
