import { DatastoreConnection } from "./connection";
import { Pair, Position } from "../monitor/models";

export const models = {
  positions: Position,
  pairs: Pair,
};

// export const models = [Position, Pair] as const;

export type Models = typeof models;

export function connect(root: string): DatastoreConnection {
  return new DatastoreConnection(root);
}
