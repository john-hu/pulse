export enum StorageType {
  SQLite,
  JSON,
}

export type Record = {
  dateTime: string;
  project: string;
  language: string;
  fileCount: number;
  blankLines: number;
  commentLines: number;
  codeLines: number;
};

export interface Storage {
  init(path: string): Promise<void>;
  putRecords(records: Record[]): Promise<void>;
  getLastRecords(project: string): Promise<Record[]>;
  finalize(): Promise<void>;
}

export type Commit = {
  dateTime: string;
  shortHash: string;
  authorEmail: string;
};
