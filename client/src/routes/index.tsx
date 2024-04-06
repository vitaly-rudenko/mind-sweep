import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Component,
})

function Component() {
  return <Navigate to='/buckets' />
}
