import { Notes } from '@/notes/notes'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/notes/')({
  component: ReceiptsComponent,
})

function ReceiptsComponent() {
  return <Notes />
}
