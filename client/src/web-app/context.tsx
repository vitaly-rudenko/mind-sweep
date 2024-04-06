import { FC, ReactNode, createContext, useEffect, useMemo } from 'react'

type ProvidedWebApp = {
  webApp: typeof Telegram.WebApp | undefined
}

export const WebAppContext = createContext<ProvidedWebApp | undefined>(undefined)

export const WebAppProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const webApp = useMemo<typeof Telegram.WebApp | undefined>(() => window.Telegram?.WebApp, [])

  useEffect(() => {
    if (!webApp?.initData) return
    webApp.ready()
    webApp.expand()
  }, [webApp])

  const value: ProvidedWebApp = webApp?.initData ? {
    webApp,
  } : {
    webApp: undefined,
  }

  return <WebAppContext.Provider value={value}>{children}</WebAppContext.Provider>
}

