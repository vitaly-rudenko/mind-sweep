import { zodResolver } from '@hookform/resolvers/zod'
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
import { type FC, useState, useCallback, useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { Form, FormField, FormItem } from '@/components/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import { useDebounce } from '@uidotdev/usehooks'
import { Input } from '@/components/input'
import { createToast, dismissToast } from '@/utils/toast'
import { useCreateIntegrationMutation } from './api'
import { ApiError } from '@/utils/api'
import { useWebApp } from '@/web-app/hooks'

const formSchema = z.discriminatedUnion('integrationType', [
  z.object({
    integrationType: z.literal('notion'),
    name: z.string(),
    metadata: z.object({
      integrationSecret: z.string().min(1),
    })
  }),
  z.object({
    integrationType: z.literal('telegram'),
    name: z.string(),
    metadata: z.object({
      initData: z.string().min(1),
    }),
  }),
])

type FormState = z.infer<typeof formSchema>

const defaultValues: FormState = {
  integrationType: 'notion',
  name: '',
  metadata: {
    integrationSecret: '',
  },
}

const integrationTypeNameMap = {
  notion: 'Notion',
  telegram: 'Telegram',
} satisfies Record<FormState['integrationType'], string>

export const IntegrationEditor: FC<{
  open: boolean
  onClose: () => void
}> = ({ open, onClose }) => {
  const { webApp } = useWebApp()

  // TODO: this is a hacky fix to avoid clicking on submit button when the value is selected because touch event passes through
  const [selectOpen, setSelectOpen] = useState(false)
  const selectOpenDebounced = useDebounce(selectOpen, 50)

  const createMutation = useCreateIntegrationMutation()

  const form = useForm<FormState>({
    resolver: zodResolver(formSchema),
    defaultValues,
  })

  const [$integrationType] = form.watch(['integrationType'])

  const onSubmit = useCallback(async (formState: FormState) => {
    const toastId = createToast('Adding Integration...', { type: 'loading' })

    try {
      await createMutation.mutateAsync(formState)

      createToast('Integration has been saved', { type: 'success', toastId })
      onClose()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ALREADY_EXISTS') {
        createMutation.reset()
        createToast('You have already added this Integration', { type: 'error', toastId })
        return
      }

      console.error(error)
      dismissToast(toastId)
    }
  }, [createMutation, onClose])

  useEffect(() => {
    if ($integrationType === 'telegram') {
      form.setValue('metadata.initData', webApp?.initData ?? '')
    }
  }, [$integrationType, form, webApp?.initData])

  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
    }
  }, [form, open])

  return (
    <Drawer open={open} onOpenChange={(open) => !open && onClose()} dismissible={false}>
      <DrawerContent>
        <div className='mx-auto w-full max-w-sm'>
          <DrawerHeader>
            <DrawerTitle>Link buckets</DrawerTitle>
            <DrawerDescription>Connect a service to store & link your Notes.</DrawerDescription>
          </DrawerHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className='px-4 flex flex-col gap-2'>

              </div>
              <DrawerFooter>
                <Button type='submit' disabled={selectOpenDebounced}>Add {integrationTypeNameMap[$integrationType]} Integration</Button>
                <DrawerClose asChild>
                  <Button variant='outline' disabled={selectOpenDebounced}>Cancel</Button>
                </DrawerClose>
              </DrawerFooter>
            </form>
          </Form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
