import { loadConfig } from '../../src/config'
import { connect, type Database } from '../../src/db/client'
import { applySchema } from '../../src/db/indexes'

export async function withTestDb(): Promise<Database> {
  const config = loadConfig({
    NODE_ENV: 'test',
    PORT: '3000',
    MONGO_URL: process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017',
    MONGO_DB: `marchmont_test_${crypto.randomUUID().slice(0, 8)}`,
    SESSION_SECRET: 'x'.repeat(32),
    IMAGES_PROVIDER: 'sandbox',
  })
  const database = await connect(config)
  await applySchema(database.db)
  return database
}

export async function dropTestDb(database: Database): Promise<void> {
  await database.db.dropDatabase()
  await database.close()
}
