import { MongoClient, type Db } from 'mongodb'
import type { Config } from '../config'
import { createRepositories, type Repositories } from './repositories'

export type Database = {
  readonly client: MongoClient
  readonly db: Db
  readonly repositories: Repositories
  close(): Promise<void>
}

export async function connect(config: Config): Promise<Database> {
  const client = new MongoClient(config.mongoUrl, {
    ignoreUndefined: true,
    serverSelectionTimeoutMS: 5000,
    // promoteLongs defaults to true, which returns any int64 that fits in a
    // double as a plain number. Every ordinary price would arrive float-backed
    // and only amounts above 2^53 would stay a Long, so the bug hides from any
    // test using realistic values.
    promoteLongs: false,
  })
  await client.connect()
  const db = client.db(config.mongoDb)
  return {
    client,
    db,
    repositories: createRepositories(db),
    close: () => client.close(),
  }
}
