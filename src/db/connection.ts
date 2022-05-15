import { existsSync, mkdirSync } from "fs";
import leveldown from "leveldown";
import levelup, { LevelUp } from "levelup";
import { DatastoreDocument } from "./document";
import { DatastoreRepository } from "./repository";

export type DatastoreCtor<T extends DatastoreDocument<T>> = new () => T;

export class DatastoreConnection {
  private db: LevelUp;
  private dbs: Record<string, DatastoreRepository<any>> = {};

  constructor(private root: string) {
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }

    this.db = levelup(leveldown(this.root));
  }

  getRepository<T extends DatastoreDocument<T>>(ctor: DatastoreCtor<T>) {
    if (!this.dbs[ctor.name]) {
      this.dbs[ctor.name] = new DatastoreRepository(ctor, this.db);
    }
    return this.dbs[ctor.name] as DatastoreRepository<T>;
  }
}
