import { type FC, useState, type ReactNode } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/popover'
import { useIntegrationsQuery } from './api'
import type { Integration } from '@/types'

export const IntegrationCombobox: FC<{
  placeholder: ReactNode
  selected?: Integration
  onSelect: (integration: Integration | undefined) => unknown
  disabled?: boolean
}> = ({ placeholder, selected, onSelect, disabled }) => {
  const [open, setOpen] = useState(false)

  const { data } = useIntegrationsQuery()

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
              ? <IntegrationComponent integration={selected} />
              : <>{placeholder}</>}
          </div>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='p-0 my-2 mx-4'>
        <Command>
          <CommandInput placeholder='Select integration' />
          <CommandEmpty>No integrations found.</CommandEmpty>
          <CommandGroup>
            <CommandList>
              {data?.items.map((item) => (
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
                  <IntegrationComponent integration={item} />
                </CommandItem>
              ))}
            </CommandList>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const IntegrationComponent: FC<{ integration: Integration }> = ({ integration }) => {
  return <div className='flex flex-col items-start'>
    <div>{integration.name}</div>
    <div className='text-xs text-primary/50'>{integration.integrationType === 'telegram' ? 'Telegram' : 'Notion'}</div>
  </div>
}

function getItemQuery(integration: Integration): string {
  return integration.name + ' ' + (integration.integrationType === 'telegram' ? 'Telegram' : 'Notion')
}
