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
              {data?.items.filter((item) => !exclude || exclude.every(e => e.id !== item.id)).map((item) => (
                <CommandItem
                  className='cursor-pointer'
                  key={item.id}
                  value={getItemQuery(item)}
                  onSelect={() => {
                    if (item.id === selected?.id) {
                      onSelect(undefined)
                    } else {
                      onSelect(item)
                    }

                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selected?.id === item.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <BucketComponent bucket={item} />
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
  return <div className='flex flex-col items-start'>
    <div>{bucket.name}</div>
    <div className='text-xs text-primary/50'>{bucket.bucketType === 'telegram_chat' ? 'Telegram chat' : 'Notion database'}</div>
  </div>
}

function getItemQuery(bucket: Bucket): string {
  return bucket.name + ' ' + (bucket.bucketType === 'telegram_chat' ? 'Telegram chat' : 'Notion database')
}
