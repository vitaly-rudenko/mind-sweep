import { type FC, useState, type ReactNode } from 'react'
import { Button } from '@/components/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/popover'
import { useBucketsQuery } from './api'
import type { Bucket } from '@/types'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/utils/cn'

export const BucketCombobox: FC<{
  placeholder: ReactNode
  selected?: Bucket
  exclude?: Bucket[]
  onSelect: (bucket: Bucket | undefined) => void
  disabled?: boolean
}> = ({ placeholder, selected, exclude, onSelect, disabled }) => {
  const [open, setOpen] = useState(false)

  const { data } = useBucketsQuery()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          disabled={disabled}
          variant='outline'
          role='combobox'
          className={cn(
            'justify-between pl-3 pr-2 h-16',
            !selected && 'text-muted-foreground'
          )}
        >
          <div className='overflow-hidden'>
            {selected
              ? <BucketComponent bucket={selected} />
              : <>{placeholder}</>}
          </div>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='p-0 my-2 mx-4'>
        <Command>
          <CommandInput placeholder='Select bucket' />
          <CommandEmpty>No buckets found.</CommandEmpty>
          <CommandGroup>
            <CommandList>
              {data?.items.filter(({ bucket }) => !exclude || exclude.every(e => e.id !== bucket.id)).map(({ bucket }) => (
                <CommandItem
                  className='cursor-pointer'
                  key={bucket.id}
                  value={getItemQuery(bucket)}
                  onSelect={() => {
                    if (bucket.id === selected?.id) {
                      onSelect(undefined)
                    } else {
                      onSelect(bucket)
                    }

                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      selected?.id === bucket.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <BucketComponent bucket={bucket} />
                </CommandItem>
              ))}
            </CommandList>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const BucketComponent: FC<{ bucket: Bucket }> = ({ bucket }) => {
  return <div className='flex flex-col items-start overflow-hidden'>
    <div className='truncate'>{bucket.name}</div>
    <div className='text-xs text-primary'>{bucket.bucketType === 'telegram_chat' ? 'Telegram chat' : 'Notion database'}</div>
  </div>
}

function getItemQuery(bucket: Bucket): string {
  return bucket.name + ' ' + (bucket.bucketType === 'telegram_chat' ? 'Telegram chat' : 'Notion database')
}
