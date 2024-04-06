import { Button } from '@/components/button'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/card'
import { useEffect, useMemo, useState, type FC } from 'react'
import { IntegrationEditor } from './integration-editor'
import { useDeleteIntegrationMutation, useIntegrationsQuery } from './api'
import type { Integration } from '@/types'
import { createToast } from '@/utils/toast'
import { Alert } from '@/components/alert-dialog'
import { cn } from '@/utils/cn'
import { Separator } from '@/components/separator'

export const Integrations: FC = () => {
  const { data, refetch } = useIntegrationsQuery()

  const [deleteId, setDeleteId] = useState<number>()
  const deleteMutation = useDeleteIntegrationMutation()

  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    if (!editorOpen) {
      refetch()
    }
  }, [editorOpen, refetch])

  useEffect(() => {
    if (deleteMutation.isSuccess) {
      createToast('Integration has been deleted', { type: 'success' })
      setDeleteId(undefined)
      refetch()
    }
  }, [deleteMutation.isSuccess, refetch])

  return <>
    <IntegrationEditor open={editorOpen} onClose={() => setEditorOpen(false)} />

    <Alert
      title='Delete  Integration?'
      confirm='Yes, delete it'
      disabled={deleteMutation.isPending}
      open={deleteId !== undefined}
      onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
      onCancel={() => setDeleteId(undefined)}
    />

    <div className='flex flex-col gap-2'>
      <div className='flex justify-between items-baseline'>
        <div className='text-xl font-medium'>Integrations</div>
        <Button variant='link' onClick={() => setEditorOpen(true)}>Add integration</Button>
      </div>
      <div className='flex flex-col gap-2'>
        {!!data && data.items.map((integration) => (
          <Integration key={integration.id} integration={integration} onDelete={() => setDeleteId(integration.id)} />
        ))}
      </div>
    </div>
  </>
}

const Integration: FC<{
  integration: Integration
  onDelete: () => void
}> = ({ integration, onDelete }) => {
  const [expanded, setExpanded] = useState(false)

  return <Card className={cn(
    'overflow-hidden transition-shadow hover:shadow-lg',
    expanded ? 'shadow-lg' : 'shadow-md',
  )}>
    <CardHeader className='cursor-pointer' onClick={() => setExpanded(!expanded)}>
      <CardTitle className='flex items-baseline gap-2'>
        <div>{integration.name}</div>
        <CardDescription>{integration.integrationType === 'telegram' ? 'Telegram' : 'Notion'}</CardDescription>
      </CardTitle>
    </CardHeader>
    <div className={cn('transition-[height]', expanded ? 'h-10' : 'h-0')}>
      <Separator />
      <CardFooter className='flex flex-row items-stretch p-0 h-full'>
        <Button onClick={onDelete} variant='link' className='grow basis-1 text-destructive'>Delete</Button>
      </CardFooter>
    </div>
  </Card>
}
