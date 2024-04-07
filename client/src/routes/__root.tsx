import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { Toaster } from '@/components/sonner'
import { ThemeProvider } from '@/theme/context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type FC } from 'react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/button'
import { WebAppProvider } from '@/web-app/context'
import { AuthProvider } from '@/auth/context'
import { useAuth } from '@/auth/hooks'
import { Navigation } from '@/navigation/navigation'

export const Route = createRootRoute({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      authToken: typeof search.auth_token === 'string' ? search.auth_token : undefined,
    }
  },
  component: RootComponent,
  notFoundComponent: () => {
    return <div className='flex flex-col gap-3'>
      <div className='flex flex-row justify-between items-baseline font-medium text-xl'>
        <div>Whoops, page not found!</div>
      </div>

      <Link to='/'>
        <Button>Go home</Button>
      </Link>
    </div>
  }
})

function RootComponent() {
  const queryClient = new QueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <WebAppProvider>
          <AuthProvider>
            <div className='flex justify-center'>
              <div className={cn('flex flex-col gap-1 px-3 pt-3 pb-6 select-none w-full min-w-[18rem] max-w-[48rem]')}>
                <Navigation />
                <Outlet />
                <Toaster />
                <CopyAuthLinkButton />
              </div>
            </div>
          </AuthProvider>
        </WebAppProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

const CopyAuthLinkButton: FC = () => {
  const auth = useAuth()
  if (!auth.authToken) return null

  const url = new URL(window.location.origin)
  const searchParams = new URLSearchParams()
  searchParams.set('auth_token', auth.authToken)
  url.hash = `/?${searchParams.toString()}`

  return <input className='text-xs text-background pt-2 outline-none bg-transparent' type='text' readOnly value={url.toString()} />
}
