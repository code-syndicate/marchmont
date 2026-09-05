import { createApp } from './app'
import { loadConfig } from './config'
import { connect } from './db/client'
import { applySchema } from './db/indexes'

const config = loadConfig(process.env)
const database = await connect(config)
await applySchema(database.db)

const app = createApp({ config, database })
const server = app.listen(config.port, () => {
  console.log(`nash-luxury-realty listening on ${config.port} in ${config.nodeEnv}`)
})

const shutdown = async (signal: string): Promise<void> => {
  console.log(`${signal} received, shutting down`)
  server.close()
  await database.close()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })
