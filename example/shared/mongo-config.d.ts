export interface ExampleMongoConfig {
  dbName: string
  mongoUrl: string
  mongoOptions: Record<string, unknown>
  sessionSecret: string
  cryptoSecret?: string
}

export function getMongoConfig(): ExampleMongoConfig
