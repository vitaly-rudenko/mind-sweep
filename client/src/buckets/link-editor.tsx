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
import { createToast, dismissToast } from '@/utils/toast'
import { useBucketsQuery, useCreateLinkMutation } from './api'
import { ApiError } from '@/utils/api'
import type { Bucket } from '@/types'
import { BucketCombobox } from './bucket-combobox'
import { ArrowDown } from 'lucide-react'

type FormState = {
  sourceBucket: Bucket | ''
  mirrorBucket: Bucket | ''
  priority: number
  template: string
  defaultTags: string[]
}

const defaultValues: FormState = {
  sourceBucket: '',
  mirrorBucket: '',
  priority: 0,
  template: '',
  defaultTags: [],
}

export const LinkEditor: FC<{
  sourceBucket?: Bucket
  mirrorBucket?: Bucket
  open: boolean
  onClose: () => void
}> = ({ sourceBucket, mirrorBucket, open, onClose }) => {
  const { data: buckets } = useBucketsQuery()
  const createMutation = useCreateLinkMutation()

  const form = useForm<FormState>({ defaultValues })
  const [$sourceBucket, $mirrorBucket] = form.watch(['sourceBucket', 'mirrorBucket'])

  const onSubmit = useCallback(async (formState: FormState) => {
    if (formState.sourceBucket === '' || formState.mirrorBucket === '') return

    const toastId = createToast('Adding Link...', { type: 'loading' })

    try {
      await createMutation.mutateAsync({
        sourceBucketId: formState.sourceBucket.id,
        mirrorBucketId: formState.mirrorBucket.id,
        priority: formState.priority,
        template: formState.template || undefined,
        defaultTags: formState.defaultTags.length > 0 ? formState.defaultTags : undefined,
      })

      createToast('Link has been saved', { type: 'success', toastId })
      onClose()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ALREADY_EXISTS') {
        createMutation.reset()
        createToast('You have already added this Link', { type: 'error', toastId })
        return
      }

      console.error(error)
      dismissToast(toastId)
    }
  }, [createMutation, onClose])

  const switchBuckets = useCallback(() => {
    form.setValue('sourceBucket', $mirrorBucket)
    form.setValue('mirrorBucket', $sourceBucket)
  }, [$mirrorBucket, $sourceBucket, form])

  useEffect(() => {
    if (open) {
      form.reset({
        ...defaultValues,
        sourceBucket,
        mirrorBucket,
      })
    }
  }, [form, open, mirrorBucket, sourceBucket])

  if (!buckets) return null

  return (
    <Drawer open={open} onOpenChange={(open) => !open && onClose()} dismissible={false}>
      <DrawerContent>
        <div className='mx-auto w-full max-w-sm'>
          <DrawerHeader>
            <DrawerTitle>Link Buckets</DrawerTitle>
            <DrawerDescription>Link your Buckets to sync Notes between them.</DrawerDescription>
          </DrawerHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className='px-4 flex flex-col gap-2'>
                <FormField
                  control={form.control}
                  name='mirrorBucket'
                  render={({ field }) => (
                    <FormItem className='flex flex-col'>
                      <BucketCombobox
                        placeholder='Select mirror bucket'
                        selected={field.value !== '' ? field.value : undefined}
                        onSelect={(bucket) => form.setValue('mirrorBucket', bucket ?? '')}
                      />
                    </FormItem>
                  )}
                />

                <div className='flex justify-center cursor-pointer' onClick={() => switchBuckets()}>
                  <ArrowDown className='size-6' />
                </div>

                <FormField
                  control={form.control}
                  name='sourceBucket'
                  render={({ field }) => (
                    <FormItem className='flex flex-col'>
                      <BucketCombobox
                        placeholder='Select source bucket'
                        selected={field.value !== '' ? field.value : undefined}
                        onSelect={(bucket) => form.setValue('sourceBucket', bucket ?? '')}
                      />
                    </FormItem>
                  )}
                />
              </div>

              <DrawerFooter>
                <Button type='submit'>
                  {$sourceBucket && $mirrorBucket ? `Link ${$sourceBucket.name} to ${$mirrorBucket.name}` : 'Link Buckets'}
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
