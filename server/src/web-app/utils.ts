import type { Deps } from '../registry.js'

export function createWebAppUrlGenerator({ botInfo, webAppName }: Deps<'botInfo' | 'webAppName'>) {
  return (command?: string) => {
    const query = command ? `?startapp=${command}` : ''
    return `https://t.me/${botInfo.username}/${webAppName}${query}`
  }
}
