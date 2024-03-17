import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/tasks/')({
  component: ReceiptsComponent,
})

function ReceiptsComponent() {
  return <div className='text-xl'>Tasks</div>
}
