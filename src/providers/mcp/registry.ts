import type { McpProvider } from './types.js'
import { loadProviderConfigs } from './config-loader.js'
import { ConfigMcpProvider } from './config-mcp-provider.js'

let providers: McpProvider[] | null = null

function ensureLoaded(): McpProvider[] {
  if (providers) return providers
  providers = loadProviderConfigs().map((cfg) => new ConfigMcpProvider(cfg))
  return providers
}

export function getRegisteredProviders(): McpProvider[] {
  return ensureLoaded()
}

export function getAvailableProviders(): McpProvider[] {
  return ensureLoaded().filter((p) => p.isAvailable())
}
