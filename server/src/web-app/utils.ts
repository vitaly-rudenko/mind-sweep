import crypto from 'crypto'
import type { Deps } from '../registry.js'

export function createWebAppUrlGenerator({ botInfo, webAppName }: Deps<'botInfo' | 'webAppName'>) {
  return (command?: string) => {
    const query = command ? `?startapp=${command}` : ''
    return `https://t.me/${botInfo.username}/${webAppName}${query}`
  }
}

// https://gist.github.com/konstantin24121/49da5d8023532d66cc4db1136435a885?permalink_comment_id=4574538#gistcomment-4574538
export function checkWebAppSignature(botToken: string, initData: string) {
  const urlParams = new URLSearchParams(initData)

  const hash = urlParams.get('hash')
  urlParams.delete('hash')
  urlParams.sort()

  let dataCheckString = ''
  for (const [key, value] of urlParams.entries()) {
      dataCheckString += `${key}=${value}\n`
  }
  dataCheckString = dataCheckString.slice(0, -1)

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken)
  const calculatedHash = crypto.createHmac('sha256', secret.digest()).update(dataCheckString).digest('hex')

  return calculatedHash === hash
}

