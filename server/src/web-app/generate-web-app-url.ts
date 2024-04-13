import { registry, type Deps } from '../registry.js'

export function generateWebAppUrl(command?: string, { botInfo, webAppName }: Deps<'botInfo' | 'webAppName'> = registry.export()) {
  const query = command ? `?startapp=${command}` : ''
  return `https://t.me/${botInfo.username}/${webAppName}${query}`
}
