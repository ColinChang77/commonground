import "server-only";
import { drizzle } from "drizzle-orm/d1";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type DB = ReturnType<typeof createDb>;

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

const cache = new WeakMap<D1Database, DB>();

export function getDb(): DB {
  const d1 = getEnv().DB;
  let db = cache.get(d1);
  if (!db) {
    db = createDb(d1);
    cache.set(d1, db);
  }
  return db;
}

export { schema };
