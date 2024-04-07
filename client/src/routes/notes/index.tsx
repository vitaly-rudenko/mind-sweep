import { Notes } from '@/notes/notes'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/notes/')({
  component: Component,
})

function Component() {
  return <Notes />
}
