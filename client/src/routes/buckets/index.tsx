import { Buckets } from '@/buckets/buckets'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/buckets/')({
  component: Component,
})

function Component() {
  return <Buckets />
}
