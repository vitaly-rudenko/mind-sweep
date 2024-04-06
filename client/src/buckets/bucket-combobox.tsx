import { type FC, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/popover'

const buckets = [
  {
    id: 1,
    name: 'John (@johndoe)',
    bucketType: 'telegram_chat',
  },
  {
    id: 2,
    name: 'Work',
    bucketType: 'notion_database',
  },
  {
    id: 3,
    name: 'Personal',
    bucketType: 'notion_database',
  },
]

export const BucketCombobox: FC<{ className?: string }> = ({ className }) => {
  const [open, setOpen] = useState(false)
  const [selectedBucket, setSelectedBucket] = useState<typeof buckets[number]>()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='link'
          role='combobox'
          aria-expanded={open}
          className={cn('p-0 justify-between h-auto', className)}
        >
          Link to...
        </Button>
      </PopoverTrigger>
      <PopoverContent className='p-0 my-2 mx-4'>
        <Command>
          <CommandInput placeholder='Select bucket' />
          <CommandEmpty>No buckets found.</CommandEmpty>
          <CommandGroup>
            <CommandList>
              {buckets.map((bucket) => (
                <CommandItem
                  className='cursor-pointer'
                  key={bucket.id}
                  value={getBucketQuery(bucket)}
                  onSelect={() => {
                    setSelectedBucket(bucket)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedBucket?.id === bucket.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <Bucket bucket={bucket} />
                </CommandItem>
              ))}
            </CommandList>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const Bucket: FC<{ bucket: typeof buckets[number] }> = ({ bucket }) => {
  return <div className='flex flex-col items-start'>
    <div>{bucket.name}</div>
    <div className='text-xs text-primary/50'>{bucket.bucketType === 'telegram_chat' ? 'Telegram chat' : 'Notion database'}</div>
  </div>
}

function getBucketQuery(bucket: typeof buckets[number]): string {
  return bucket.name + ' ' + (bucket.bucketType === 'telegram_chat' ? 'Telegram chat' : 'Notion database')
}
