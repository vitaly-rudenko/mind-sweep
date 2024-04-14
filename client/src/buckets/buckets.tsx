import { Button } from '@/components/button'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter, CardContent } from '@/components/card'
import { useCallback, useEffect, useState, type FC } from 'react'
import { BucketEditor } from './bucket-editor'
import { useDeleteBucketMutation, useBucketsQuery, useDeleteLinkMutation, useSyncLinkMutation, useSwapLinksMutation } from './api'
import type { Bucket, Bucket as BucketComponent, Link } from '@/types'
import { createToast, dismissToast } from '@/utils/toast'
import { Alert } from '@/components/alert-dialog'
import { cn } from '@/utils/cn'
import { Separator } from '@/components/separator'
import { ArrowDown, ArrowUp, CornerDownRight } from 'lucide-react'
import { LinkEditor } from './link-editor'
import { bucketTypeName } from './bucket-type-name'

export const Buckets: FC = () => {
  const { data, refetch } = useBucketsQuery()

  const syncLinkMutation = useSyncLinkMutation()
  const swapLinksMutation = useSwapLinksMutation()

  const [deleteId, setDeleteId] = useState<number>()
  const deleteMutation = useDeleteBucketMutation()

  const [deleteLinkId, setDeleteLinkId] = useState<number>()
  const deleteLinkMutation = useDeleteLinkMutation()

  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedBucket, setSelectedBucket] = useState<Bucket>()

  const handleSyncLink = useCallback(async (link: Link) => {
    const toastId = createToast('Initiating sync...', { type: 'loading' })

    try {
      await syncLinkMutation.mutateAsync(link.id)
      createToast('Sync has been initiated', {
        description: 'It might take a few minutes to complete.',
        type: 'success',
        toastId,
      })
    } catch (err) {
      console.error(err)
      dismissToast(toastId)
    }
  }, [syncLinkMutation]);

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

  useEffect(() => {
    if (swapLinksMutation.isSuccess) {
      refetch()
    }
  }, [swapLinksMutation.isSuccess, refetch])

  useEffect(() => {
    if (deleteLinkMutation.isSuccess) {
      createToast('Buckets have been unlinked', { type: 'success' })
      setDeleteLinkId(undefined)
      refetch()
    }
  }, [deleteLinkMutation.isSuccess, refetch])

  return <>
    <BucketEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
    <LinkEditor mirrorBucket={selectedBucket} open={!!selectedBucket} onClose={() => setSelectedBucket(undefined)} />

    <Alert
      title='Delete Bucket?'
      confirm='Yes, delete it'
      disabled={deleteMutation.isPending}
      open={deleteId !== undefined}
      onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
      onCancel={() => setDeleteId(undefined)}
    />

    <Alert
      title='Unlink Buckets?'
      confirm='Yes, unlink them'
      disabled={deleteLinkMutation.isPending}
      open={deleteLinkId !== undefined}
      onConfirm={() => deleteLinkId && deleteLinkMutation.mutate(deleteLinkId)}
      onCancel={() => setDeleteLinkId(undefined)}
    />

    <div className='flex flex-col gap-2'>
      <div className='flex justify-between items-baseline'>
        <div className='text-xl font-medium'>Buckets</div>
        <Button variant='link' onClick={() => setEditorOpen(true)} className='pr-0'>Add Bucket</Button>
      </div>
      <div className='flex flex-col gap-8'>
        {!!data && data.items.map(({ bucket, sourceLinks }) => (
          <BucketComponent key={bucket.id}
            buckets={data.items.map(({ bucket }) => bucket)}
            bucket={bucket}
            sourceLinks={sourceLinks}
            onLink={() => setSelectedBucket(bucket)}
            onDelete={() => setDeleteId(bucket.id)}
            onSyncLink={handleSyncLink}
            onSwapLinks={(link1, link2) => swapLinksMutation.mutateAsync({ link1, link2 })}
            onDeleteLink={(link) => setDeleteLinkId(link.id)}
          />
        ))}
      </div>
    </div>
  </>
}

const BucketComponent: FC<{
  buckets: Bucket[]
  sourceLinks: Link[]
  bucket: Bucket
  onLink: () => void
  onDelete: () => void
  onSyncLink: (link: Link) => void
  onSwapLinks: (link1: Link, link2: Link) => void
  onDeleteLink: (link: Link) => void
}> = ({ buckets, bucket, sourceLinks, onLink, onDelete, onSyncLink, onSwapLinks, onDeleteLink }) => {
  const [expanded, setExpanded] = useState(false)

  return <div className='flex flex-col gap-0'>
    <Card className={cn('overflow-hidden', sourceLinks.length > 0 && 'rounded-br-none')}>
      <CardHeader className='cursor-pointer' onClick={() => setExpanded(!expanded)}>
        <CardTitle className='flex justify-between items-baseline gap-2'>
          <div className='truncate leading-normal'>{bucket.name}</div>
          <CardDescription className='whitespace-nowrap text-primary'>{bucketTypeName(bucket.bucketType)}</CardDescription>
        </CardTitle>
      </CardHeader>
      <div className={cn('transition-all', expanded ? 'h-10' : 'h-0 opacity-0')}>
        <Separator />
        <CardFooter className='flex flex-row items-stretch p-0 h-full bg-background'>
          <Button onClick={onDelete} variant='link' className='grow basis-1 text-destructive'>Delete</Button>
        </CardFooter>
      </div>
    </Card>
    <div className='flex flex-col gap-0'>
      {sourceLinks.map((link, i) => {
        const prevLink = i > 0 ? sourceLinks.at(i - 1) : undefined
        const nextLink = i < sourceLinks.length - 1 ? sourceLinks.at(i + 1) : undefined

        return <LinkComponent key={link.id}
          buckets={buckets}
          link={link}
          first={i === 0}
          last={i === sourceLinks.length - 1}
          onSync={() => onSyncLink(link)}
          onMoveUp={prevLink ? () => onSwapLinks(link, prevLink) : undefined}
          onMoveDown={nextLink ? () => onSwapLinks(link, nextLink) : undefined}
          onDelete={() => onDeleteLink(link)}
        />
      })}
      <div className='flex items-center gap-2 pt-2 pl-2'>
        <CornerDownRight className='inline size-6 shrink-0 text-primary' />
        <Button variant='link' role='combobox' className='p-0 justify-between h-auto' onClick={onLink}>
          Link to...
        </Button>
      </div>
    </div>
  </div>
}

const LinkComponent: FC<{
  buckets: Bucket[]
  link: Link
  first: boolean
  last: boolean
  onSync: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDelete: () => void
}> = ({ buckets, link, first, last, onSync, onMoveUp, onMoveDown, onDelete }) => {
  const [expanded, setExpanded] = useState(false)

  const sourceBucket = buckets.find((b) => b.id === link.sourceBucketId)
  if (!sourceBucket) return null

  return <div className='flex flex-row items-center gap-2 pl-2'>
    <CornerDownRight className='inline size-6 shrink-0 text-primary' />
    <Card className={cn(
      'grow overflow-hidden bg-card/50 rounded-none',
      !last && 'border-b-0',
      last && 'rounded-b',
      first && 'border-t-0'
    )}>
      <CardHeader className='cursor-pointer' onClick={() => setExpanded(!expanded)}>
        <CardTitle className='flex justify-between items-baseline gap-2'>
          <div className='truncate leading-normal'>{sourceBucket.name}</div>
          <CardDescription className='text-primary whitespace-nowrap'>{bucketTypeName(sourceBucket.bucketType)}</CardDescription>
        </CardTitle>
      </CardHeader>
      {!!(link.template || link.defaultTags) && (
        <CardContent className='cursor-pointer' onClick={() => setExpanded(!expanded)}>
          {!!link.template && <div className='text-sm text-primary font-mono'>{link.template}</div>}
          {!!link.defaultTags && <div className='text-sm text-primary'>{link.defaultTags.map(tag => `#${tag}`).join(' ')}</div>}
        </CardContent>
      )}
      <div className={cn('transition-all', expanded ? 'h-10' : 'h-0 opacity-0')}>
        <Separator />
        <CardFooter className='flex flex-row items-stretch p-0 h-full bg-background'>
          <Button onClick={onMoveUp} disabled={!onMoveUp} variant='link' size='icon' className='min-w-10'><ArrowUp /></Button>
          <Button onClick={onMoveDown} disabled={!onMoveDown} variant='link' size='icon' className='min-w-10'><ArrowDown /></Button>
          <Button onClick={onSync} variant='link' className='grow basis-1'>Sync</Button>
          <Button onClick={onDelete} variant='link' className='grow basis-1 text-destructive'>Delete</Button>
        </CardFooter>
      </div>
    </Card>
  </div>
}
