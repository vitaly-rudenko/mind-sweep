import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { Toaster } from '@/components/sonner'
import { ThemeProvider } from '@/theme/context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/button'

export const Route = createRootRoute({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      code: typeof search.code === 'string' ? search.code : undefined,
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
  const [focusedOnInput, setFocusedOnInput] = useState(false)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const focusInListener = (event: FocusEvent) => {
      if (event.target instanceof HTMLInputElement) {
        clearTimeout(timeoutId)
        setFocusedOnInput(true)
      }
    }

    const focusOutListener = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => setFocusedOnInput(false), 50)
    }

    window.document.addEventListener('focusin', focusInListener)
    window.document.addEventListener('focusout', focusOutListener)

    return () => {
      clearTimeout(timeoutId)
      window.document.removeEventListener('focusin', focusInListener)
      window.document.removeEventListener('focusout', focusOutListener)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <div className={cn(
          'flex flex-col gap-1 px-3 pt-3 pb-6 select-none w-full min-w-[18rem] max-w-[34rem]',
          focusedOnInput && 'pb-[50vh]',
        )}>
          <Outlet />
          <Toaster />
        </div>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
