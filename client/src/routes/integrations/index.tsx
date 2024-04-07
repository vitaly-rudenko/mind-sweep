import { Integrations } from '@/integrations/integrations'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/integrations/')({
  component: Component,
})

function Component() {
  return <Integrations />
}
