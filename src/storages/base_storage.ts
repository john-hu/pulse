import { Record, Storage } from './types';

const BUFFER_SIZE = 500;

export abstract class BaseStorage implements Storage {
  protected buffers: Record[] = [];
  // abstract interfaces
  abstract init(path: string): Promise<void>;
  abstract getLastRecords(project: string): Promise<Record[]>;
  protected abstract flushBuffer(): Promise<void>;
  // implementations
  async putRecords(records: Record[]): Promise<void> {
    this.buffers = [...this.buffers, ...records];
    if (this.buffers.length < BUFFER_SIZE) {
      return;
    }
    await this.flushBuffer();
    this.buffers = [];
  }

  async finalize(): Promise<void> {
    await this.flushBuffer();
    this.buffers = [];
  }
}
