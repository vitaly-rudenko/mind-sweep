import { Card, CardContent, CardHeader, CardTitle } from '@/components/card'
import { Separator } from '@/components/separator'
import { cn } from '@/utils/cn'
import { useState, type FC, type ReactNode } from 'react'
import { useNotesQuery } from './api'
import { BucketCombobox } from '@/buckets/bucket-combobox'
import type { Bucket, Note } from '@/types'

export const Notes: FC = () => {
  const [bucket, setBucket] = useState<Bucket>()
  const { data } = useNotesQuery(bucket?.id)

  return <div className='flex flex-col gap-3'>
    <BucketCombobox
      placeholder='Select source bucket'
      onSelect={(bucket) => setBucket(bucket)}
      selected={bucket}
    />

    {!!(bucket && data) && <>
      {data.items.map((note, i) => <NoteComponent key={i} note={note}/>)}
    </>}
  </div>
}

const NoteComponent: FC<{ note: Note }> = ({ note }) => {
  const [visible, setVisible] = useState(true)

  return <Card>
    <CardHeader>
      <CardTitle className='cursor-pointer transition-colors hover:text-primary/70' onClick={() => setVisible(!visible)}>
        {note.content}
      </CardTitle>
    </CardHeader>
    {note.tags.length > 0 && (
      <CardContent className={cn('flex flex-col gap-3 animation-top-down', !visible && 'hidden')}>
        {note.tags.map(tag => `#${tag}`).join(' ')}
      </CardContent>
    )}
  </Card>
}
