import * as path from 'path';
import { ArgumentParser } from 'argparse';
import * as dotenv from 'dotenv';
import { Workspace } from './workspace';
import { StorageType } from './storages';
dotenv.config();

(async () => {
  const parser = new ArgumentParser();
  parser.add_argument('repo', { type: 'str', help: 'The repo for checking' });
  parser.add_argument('--workspace', {
    type: 'str',
    required: true,
    help: 'The folder for cloning/syncing Github repos',
  });
  parser.add_argument('--name', {
    type: 'str',
    required: true,
    help: 'The folder name for this repo',
  });
  parser.add_argument('--cloc-list', { type: 'str', help: 'The cloc list file.' });
  parser.add_argument('--storage-type', {
    type: 'str',
    default: 'json',
    help: 'The cloc list file.',
  });
  parser.add_argument('--storage-path', {
    type: 'str',
    default: './data.json',
    help: 'The cloc list file.',
  });
  const args = parser.parse_args();
  const storageType = args.storage_type === 'sqlite' ? StorageType.SQLite : StorageType.JSON;
  const workspace = new Workspace(args.workspace, storageType, args.storage_path);
  await workspace.init();
  await workspace.syncRepo(args.repo, args.name);
  await workspace.cloc(args.name, args.cloc_list ? path.resolve(args.cloc_list) : undefined);
})();
