import { Links } from '@/links/links'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/links/')({
  component: Component,
})

function Component() {
  return <Links />
}
