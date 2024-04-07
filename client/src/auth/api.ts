import { callApi } from '@/utils/api'

export const authenticate = async (input: { webAppInitData: typeof Telegram.WebApp.initData }): Promise<string> => {
  const response = await callApi('/authenticate-web-app', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ initData: input.webAppInitData }),
  })

  const token = await response.json()
  if (typeof token !== 'string') {
    console.warn(token)
    throw new Error('Could not get authentication token')
  }

  return token
}
