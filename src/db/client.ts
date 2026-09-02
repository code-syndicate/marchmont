import { MongoClient, type Db } from 'mongodb'
import type { Config } from '../config'

export type Database = {
  readonly client: MongoClient
  readonly db: Db
  close(): Promise<void>
}

export async function connect(config: Config): Promise<Database> {
  const client = new MongoClient(config.mongoUrl, {
    ignoreUndefined: true,
    serverSelectionTimeoutMS: 5000,
  })
  await client.connect()
  const db = client.db(config.mongoDb)
  return {
    client,
    db,
    close: () => client.close(),
  }
}
