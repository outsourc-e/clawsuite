import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type GatewayConfig = {
  auth?: {
    profiles?: Record<string, { provider?: string }>
  }
  models?: {
    providers?: Record<string, { models?: Array<{ id?: string }> }>
  }
  agents?: {
    defaults?: {
      model?: {
        primary?: string
        fallbacks?: Array<string>
      }
      models?: Record<string, unknown>
    }
  }
}

let cachedProviderNames: Array<string> | null = null
let cachedModelIds: Set<string> | null = null

/**
 * Extract provider name from auth profile key.
 * Example: "anthropic:default" -> "anthropic"
 */
function providerNameFromProfileKey(profileKey: string): string | null {
  const raw = profileKey.split(':')[0]?.trim().toLowerCase() ?? ''
  if (raw.length === 0) return null
  return raw
}

/**
 * Convert provider/model key to model id.
 * Example: "openai-codex/gpt-5.2-codex" -> "gpt-5.2-codex"
 */
function modelIdFromScopedKey(scoped: string): string | null {
  const raw = scoped.trim()
  if (!raw) return null

  const slashIndex = raw.indexOf('/')
  if (slashIndex < 0) return raw

  const modelId = raw.slice(slashIndex + 1).trim()
  return modelId.length > 0 ? modelId : null
}

/**
 * Read configured provider names from auth.profiles keys in ~/.openclaw/openclaw.json.
 * Returns only provider names (e.g., ["anthropic", "openrouter"]), never secrets.
 */
export function getConfiguredProviderNames(): Array<string> {
  if (cachedProviderNames) return cachedProviderNames

  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')

  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    const config = JSON.parse(raw) as GatewayConfig

    const providerNames = new Set<string>()

    if (config.auth?.profiles) {
      for (const profileKey of Object.keys(config.auth.profiles)) {
        const providerName = providerNameFromProfileKey(profileKey)
        if (providerName) providerNames.add(providerName)
      }
    }

    cachedProviderNames = Array.from(providerNames).sort()
    return cachedProviderNames
  } catch (error) {
    // Silently return empty when config doesn't exist (e.g. Docker containers)
    const code = (error as NodeJS.ErrnoException)?.code
    if (code !== 'ENOENT') {
      console.error('Failed to read Gateway config for provider names:', error)
    }
    return []
  }
}

/**
 * Backward-compatible alias.
 */
export function getConfiguredProviders(): Array<string> {
  return getConfiguredProviderNames()
}

/**
 * Read configured model IDs from the Gateway config file.
 * Supports both legacy models.providers.*.models[] and newer agents.defaults.models keys.
 */
export function getConfiguredModelIds(): Set<string> {
  if (cachedModelIds) return cachedModelIds

  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')

  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    const config = JSON.parse(raw) as GatewayConfig

    const modelIds = new Set<string>()

    if (config.models?.providers) {
      for (const providerConfig of Object.values(config.models.providers)) {
        if (providerConfig.models) {
          for (const model of providerConfig.models) {
            if (model.id) {
              modelIds.add(model.id)
            }
          }
        }
      }
    }

    // Current schema: agents.defaults.models["provider/model-id"]
    const defaults = config.agents?.defaults
    if (defaults?.models) {
      for (const scopedKey of Object.keys(defaults.models)) {
        const modelId = modelIdFromScopedKey(scopedKey)
        if (modelId) modelIds.add(modelId)
      }
    }

    // Include primary + fallback models as an additional source of configured IDs.
    if (defaults?.model?.primary) {
      const modelId = modelIdFromScopedKey(defaults.model.primary)
      if (modelId) modelIds.add(modelId)
    }
    if (Array.isArray(defaults?.model?.fallbacks)) {
      for (const fallback of defaults.model.fallbacks) {
        const modelId = modelIdFromScopedKey(fallback)
        if (modelId) modelIds.add(modelId)
      }
    }

    cachedModelIds = modelIds
    return cachedModelIds
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code !== 'ENOENT') {
      console.error('Failed to read Gateway config for model IDs:', error)
    }
    return new Set()
  }
}
