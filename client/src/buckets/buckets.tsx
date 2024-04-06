import { Button } from '@/components/button'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter, CardContent } from '@/components/card'
import { useEffect, useState, type FC } from 'react'
import { BucketEditor } from './bucket-editor'
import { useDeleteBucketMutation, useBucketsQuery } from './api'
import type { Bucket, Bucket as BucketComponent } from '@/types'
import { createToast } from '@/utils/toast'
import { Alert } from '@/components/alert-dialog'
import { cn } from '@/utils/cn'
import { Separator } from '@/components/separator'
import { ArrowRight } from 'lucide-react'
import { LinkEditor } from './link-editor'

export const Buckets: FC = () => {
  const { data, refetch } = useBucketsQuery()

  const [deleteId, setDeleteId] = useState<number>()
  const deleteMutation = useDeleteBucketMutation()

  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedBucket, setSelectedBucket] = useState<Bucket>()

  useEffect(() => {
    if (!editorOpen) {
      refetch()
    }
  }, [editorOpen, refetch])

  useEffect(() => {
    if (!selectedBucket) {
      refetch()
    }
  }, [selectedBucket, refetch])

  useEffect(() => {
    if (deleteMutation.isSuccess) {
      createToast('Bucket has been deleted', { type: 'success' })
      setDeleteId(undefined)
      refetch()
    }
  }, [deleteMutation.isSuccess, refetch])

  return <>
    <BucketEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
    <LinkEditor mirrorBucket={selectedBucket} open={!!selectedBucket} onClose={() => setSelectedBucket(undefined)} />

    <Alert
      title='Delete  Bucket?'
      confirm='Yes, delete it'
      disabled={deleteMutation.isPending}
      open={deleteId !== undefined}
      onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
      onCancel={() => setDeleteId(undefined)}
    />

    <div className='flex flex-col gap-2'>
      <div className='flex justify-between items-baseline'>
        <div className='text-xl font-medium'>Buckets</div>
        <Button variant='link' onClick={() => setEditorOpen(true)} className='pr-0'>Add Bucket</Button>
      </div>
      <div className='flex flex-col gap-2'>
        {!!data && data.items.map((bucket) => (
          <BucketComponent key={bucket.id}
            buckets={data.items}
            bucket={bucket}
            onLink={() => setSelectedBucket(bucket)}
            onDelete={() => setDeleteId(bucket.id)}
          />
        ))}
      </div>
    </div>
  </>
}

const BucketComponent: FC<{
  buckets: Bucket[]
  bucket: Bucket
  onLink: () => void
  onDelete: () => void
}> = ({ buckets, bucket, onLink, onDelete }) => {
  const [expanded, setExpanded] = useState(false)

  return <Card className={cn(
    'overflow-hidden transition-shadow hover:shadow-lg',
    expanded ? 'shadow-lg' : 'shadow-md',
  )}>
    <CardHeader className='cursor-pointer' onClick={() => setExpanded(!expanded)}>
      <CardTitle className='flex items-baseline gap-2'>
        <div>{bucket.name}</div>
        <CardDescription>{bucket.bucketType === 'telegram_chat' ? 'Telegram chat' : 'Notion database'}</CardDescription>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className='flex flex-col gap-2'>
        {bucket.sourceLinks.map((link) => {
          const sourceBucket = buckets.find((b) => b.id === link.sourceBucketId)
          return <div className='flex items-center gap-2'>
            <ArrowRight className='inline size-6' />
            <div>{sourceBucket?.name}</div>
          </div>
        })}
        <div className='flex items-center gap-2'>
          <ArrowRight className='inline size-6' />
          <Button variant='link' role='combobox' className='p-0 justify-between h-auto' onClick={onLink}>
            Link to...
          </Button>
        </div>
      </div>
    </CardContent>
    <div className={cn('transition-[height]', expanded ? 'h-10' : 'h-0')}>
      <Separator />
      <CardFooter className='flex flex-row items-stretch p-0 h-full'>
        <Button onClick={onDelete} variant='link' className='grow basis-1 text-destructive'>Delete</Button>
      </CardFooter>
    </div>
  </Card>
}
