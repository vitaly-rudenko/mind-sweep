import { Button } from '@/components/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/drawer'
import { type FC, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Form, FormField, FormItem } from '@/components/form'
import { Input } from '@/components/input'
import { createToast, dismissToast } from '@/utils/toast'
import { useCreateBucketMutation } from './api'
import { ApiError } from '@/utils/api'
import { useWebApp } from '@/web-app/hooks'
import { useIntegrationsQuery } from '@/integrations/api'
import { IntegrationCombobox } from '@/integrations/integration-combobox'
import type { Integration, IntegrationType } from '@/types'

type FormState = {
  integration: Integration | ''
  name: string
  metadata: {
    databaseId: string
    initData: string
  }
}

const defaultValues: FormState = {
  integration: '',
  name: '',
  metadata: {
    databaseId: '',
    initData: '',
  },
}

const bucketTypeNameMap = {
  notion: 'Notion database',
  telegram: 'Telegram chat',
} satisfies Record<IntegrationType, string>

export const BucketEditor: FC<{
  open: boolean
  onClose: () => void
}> = ({ open, onClose }) => {
  const { webApp } = useWebApp()

  const { data: integrations } = useIntegrationsQuery()
  const createMutation = useCreateBucketMutation()

  const form = useForm<FormState>({ defaultValues })
  const [$integration] = form.watch(['integration'])

  const onSubmit = useCallback(async (formState: FormState) => {
    if (!formState.integration) return

    const toastId = createToast('Adding Bucket...', { type: 'loading' })

    try {
      if (formState.integration.integrationType === 'notion') {
        await createMutation.mutateAsync({
          integrationId: formState.integration.id,
          name: formState.name,
          bucketType: 'notion_database',
          metadata: {
            databaseId: formState.metadata.databaseId,
          }
        })
      } else if (formState.integration.integrationType === 'telegram') {
        await createMutation.mutateAsync({
          integrationId: formState.integration.id,
          name: formState.name,
          bucketType: 'telegram_chat',
          metadata: {
            initData: webApp?.initData,
          }
        })
      } else {
        throw new Error('Unknown integration type')
      }

      createToast('Bucket has been saved', { type: 'success', toastId })
      onClose()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ALREADY_EXISTS') {
        createMutation.reset()
        createToast('You have already added this Bucket', { type: 'error', toastId })
        return
      }

      console.error(error)
      dismissToast(toastId)
    }
  }, [createMutation, onClose, webApp?.initData])

  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
    }
  }, [form, open])

  if (!integrations) return null

  return (
    <Drawer open={open} onOpenChange={(open) => !open && onClose()} dismissible={false}>
      <DrawerContent>
        <div className='mx-auto w-full max-w-sm'>
          <DrawerHeader>
            <DrawerTitle>Add Bucket</DrawerTitle>
            <DrawerDescription>Choose a Bucket to store your Notes into.</DrawerDescription>
          </DrawerHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className='px-4 flex flex-col gap-2'>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <Input {...field} placeholder='Name (optional)' />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='integration'
                  render={({ field }) => (
                    <FormItem className='flex flex-col'>
                      <IntegrationCombobox
                        placeholder='Select integration'
                        selected={field.value !== '' ? field.value : undefined}
                        onSelect={(integration) => form.setValue('integration', integration ?? '')}
                      />
                    </FormItem>
                  )}
                />

                {$integration !== '' && $integration.integrationType === 'notion' && (
                  <FormField
                    control={form.control}
                    name='metadata.databaseId'
                    render={({ field }) => (
                      <FormItem>
                        <Input {...field} placeholder='Database URL' onChange={(event) => {
                          const value = event.target.value
                          try {
                            const databaseId = new URL(value).pathname.split('/').at(-1)
                            if (databaseId) {
                              form.setValue('metadata.databaseId', databaseId)
                              return
                            }
                          } catch { /* noop */ }

                          form.setValue('metadata.databaseId', value)
                        }} />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <DrawerFooter>
                <Button type='submit'>
                  {$integration ? `Add ${bucketTypeNameMap[$integration.integrationType]} Bucket` : 'Add Bucket'}
                </Button>
                <DrawerClose asChild>
                  <Button variant='outline'>Cancel</Button>
                </DrawerClose>
              </DrawerFooter>
            </form>
          </Form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
