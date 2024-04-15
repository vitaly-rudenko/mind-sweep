import { Button } from '@/components/button'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter, CardContent } from '@/components/card'
import { useCallback, useEffect, useState, type FC } from 'react'
import { BucketEditor } from './bucket-editor'
import { useDeleteBucketMutation, useBucketsQuery, useDeleteLinkMutation, useSwapLinksMutation, useSyncBucketMutation } from './api'
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

  const syncBucketMutation = useSyncBucketMutation()
  const swapLinksMutation = useSwapLinksMutation()

  const [deleteId, setDeleteId] = useState<number>()
  const deleteMutation = useDeleteBucketMutation()

  const [deleteLinkId, setDeleteLinkId] = useState<number>()
  const deleteLinkMutation = useDeleteLinkMutation()

  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedBucket, setSelectedBucket] = useState<Bucket>()
  const [selectedLink, setSelectedLink] = useState<Link>()

  const handleSync = useCallback(async (bucket: Bucket) => {
    const toastId = createToast('Initiating Notes sync...', {
      description: bucket.name,
      type: 'loading',
    })

    try {
      await syncBucketMutation.mutateAsync(bucket.id)

      createToast('Notes sync has been initiated', {
        description: 'It might take a while to complete.',
        type: 'success',
        toastId,
      })
    } catch (err) {
      console.error(err)
      dismissToast(toastId)
    }
  }, [syncBucketMutation])

  useEffect(() => {
    if (!editorOpen) {
      refetch()
    }
  }, [editorOpen, refetch])

  useEffect(() => {
    if (!selectedBucket && !selectedLink) {
      refetch()
    }
  }, [selectedBucket, refetch, selectedLink])

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

  if (!data?.items) return null

  return <>
    <BucketEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
    <LinkEditor
      buckets={data.items.map(({ bucket }) => bucket)}
      link={selectedLink}
      mirrorBucket={selectedBucket}
      open={Boolean(selectedBucket || selectedLink)}
      onClose={() => {
        setSelectedBucket(undefined)
        setSelectedLink(undefined)
      }}
    />

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
            onSync={() => handleSync(bucket)}
            onLink={() => setSelectedBucket(bucket)}
            onDelete={() => setDeleteId(bucket.id)}
            onEditLink={(link) => setSelectedLink(link)}
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
  onSync: () => void
  onDelete: () => void
  onEditLink: (link: Link) => void
  onSwapLinks: (link1: Link, link2: Link) => void
  onDeleteLink: (link: Link) => void
}> = ({ buckets, bucket, sourceLinks, onLink, onSync, onDelete, onEditLink, onSwapLinks, onDeleteLink }) => {
  const [expanded, setExpanded] = useState(false)
  const [expandedLink, setExpandedLink] = useState<Link>()

  const isMirrorable = bucket.bucketType === 'telegram_chat'
  const isSourceable = bucket.bucketType === 'notion_database'

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
          {!!isSourceable && <Button onClick={onSync} variant='link' className='grow basis-1'>Sync all Notes</Button>}
          <Button onClick={onDelete} variant='link' className='grow basis-1 text-destructive'>Delete</Button>
        </CardFooter>
      </div>
    </Card>
    <div className='flex flex-col gap-0'>
      {sourceLinks.map((link, i) => {
        const prevLink = i > 0 ? sourceLinks.at(i - 1) : undefined
        const nextLink = i < sourceLinks.length - 1 ? sourceLinks.at(i + 1) : undefined

        return <LinkComponent key={link.id}
          index={i}
          buckets={buckets}
          link={link}
          expanded={link === expandedLink}
          first={i === 0}
          last={i === sourceLinks.length - 1}
          onExpand={(expanded) => expanded ? setExpandedLink(link) : setExpandedLink(undefined)}
          onEdit={() => onEditLink(link)}
          onMoveUp={prevLink ? () => onSwapLinks(link, prevLink) : undefined}
          onMoveDown={nextLink ? () => onSwapLinks(link, nextLink) : undefined}
          onDelete={() => onDeleteLink(link)}
        />
      })}
      {!!isMirrorable && <div className='flex items-center gap-2 pt-3 pl-2'>
        <CornerDownRight className='inline size-6 shrink-0 text-primary' />
        <Button variant='link' role='combobox' className='p-0 justify-between h-auto' onClick={onLink}>
          Link to...
        </Button>
      </div>}
    </div>
  </div>
}

const LinkComponent: FC<{
  index: number
  buckets: Bucket[]
  link: Link
  first: boolean
  last: boolean
  expanded: boolean
  onExpand: (expanded: boolean) => void
  onEdit: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDelete: () => void
}> = ({ index, buckets, link, first, last, expanded, onExpand, onEdit, onMoveUp, onMoveDown, onDelete }) => {
  const sourceBucket = buckets.find((b) => b.id === link.sourceBucketId)
  if (!sourceBucket) return null

  const hasContent = Boolean(link.template || link.defaultTags)

  return <div className='flex flex-row items-center gap-2 pl-2'>
    <CornerDownRight className='inline size-6 shrink-0 text-primary' />
    <Card className={cn(
      'grow overflow-hidden bg-card/50 rounded-none',
      !last && 'border-b-0',
      last && 'rounded-b',
      first && 'border-t-0'
    )}>
      <div className='cursor-pointer' onClick={() => onExpand(!expanded)}>
        <CardHeader>
          <CardTitle className='flex justify-between items-baseline gap-2'>
            <div className='truncate leading-normal'>
              <div className='text-primary inline-block min-w-4 pr-1'>{index + 1}</div>{sourceBucket.name}
            </div>
            <CardDescription className='text-primary whitespace-nowrap'>{bucketTypeName(sourceBucket.bucketType)}</CardDescription>
          </CardTitle>
        </CardHeader>
        {!!hasContent && (
          <CardContent>
            {!!link.template && <div className='text-sm text-primary font-mono'>{link.template}</div>}
            {!!link.defaultTags && <div className='text-sm text-primary'>{link.defaultTags.map(tag => `#${tag}`).join(' ')}</div>}
          </CardContent>
        )}
      </div>
      <div className={cn('transition-all', expanded ? 'h-10' : 'h-0 opacity-0')}>
        <Separator />
        <CardFooter className='flex flex-row items-stretch p-0 h-full bg-background'>
          <Button onClick={onMoveUp} disabled={!onMoveUp} variant='link' size='icon' className='min-w-10'><ArrowUp /></Button>
          <Button onClick={onMoveDown} disabled={!onMoveDown} variant='link' size='icon' className='min-w-10'><ArrowDown /></Button>
          <Button onClick={onEdit} variant='link' className='grow basis-1'>Edit</Button>
          <Button onClick={onDelete} variant='link' className='grow basis-1 text-destructive'>Delete</Button>
        </CardFooter>
      </div>
    </Card>
  </div>
}
