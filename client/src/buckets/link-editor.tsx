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
import { useCreateLinkMutation, useUpdateLinkMutation } from './api'
import { ApiError } from '@/utils/api'
import type { Bucket, Link } from '@/types'
import { BucketCombobox } from './bucket-combobox'
import { ArrowDown } from 'lucide-react'
import { Input } from '@/components/input'
import { bucketTypeName } from './bucket-type-name'

type FormState = {
  sourceBucket: Bucket | ''
  mirrorBucket: Bucket | ''
  template: string
  defaultTags: string
}

const defaultValues: FormState = {
  sourceBucket: '',
  mirrorBucket: '',
  template: '',
  defaultTags: '',
}

export const LinkEditor: FC<{
  buckets: Bucket[]
  link?: Link
  sourceBucket?: Bucket
  mirrorBucket?: Bucket
  open: boolean
  onClose: () => void
}> = ({ buckets, link, sourceBucket, mirrorBucket, open, onClose }) => {
  const createMutation = useCreateLinkMutation()
  const updateMutation = useUpdateLinkMutation()

  const form = useForm<FormState>({ defaultValues })
  const [$sourceBucket, $mirrorBucket] = form.watch(['sourceBucket', 'mirrorBucket'])

  const onSubmit = useCallback(async (formState: FormState) => {
    if (formState.sourceBucket === '' || formState.mirrorBucket === '') return

    const toastId = createToast(link ? 'Updating Link...' : 'Adding Link...', { type: 'loading' })

    try {
      const defaultTags = formState.defaultTags.split(',').map((tag) => tag.trim()).filter(Boolean)

      const input = {
        sourceBucketId: formState.sourceBucket.id,
        template: formState.template || undefined,
        defaultTags: defaultTags.length > 0 ? defaultTags : undefined,
      }

      if (link) {
        await updateMutation.mutateAsync({
          id: link.id,
          priority: link.priority,
          ...input,
        })
      } else {
        await createMutation.mutateAsync({
          mirrorBucketId: formState.mirrorBucket.id,
          ...input,
        })
      }

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
  }, [createMutation, link, onClose, updateMutation])

  const switchBuckets = useCallback(() => {
    form.setValue('sourceBucket', $mirrorBucket)
    form.setValue('mirrorBucket', $sourceBucket)
  }, [$mirrorBucket, $sourceBucket, form])

  useEffect(() => {
    if (open) {
      form.reset({
        ...defaultValues,
        sourceBucket: sourceBucket ?? '',
        mirrorBucket: mirrorBucket ?? '',
        ...link ? {
          defaultTags: link.defaultTags?.join(', ') ?? '',
          template: link.template ?? '',
          mirrorBucket: buckets.find((bucket) => bucket.id === link.mirrorBucketId) ?? '',
          sourceBucket: buckets.find((bucket) => bucket.id === link.sourceBucketId) ?? '',
        } : {}
      })
    }
  }, [form, open, mirrorBucket, sourceBucket, link, buckets])

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

                <FormField
                  control={form.control}
                  name='template'
                  render={({ field }) => (
                    <FormItem>
                      <Input
                        {...field}
                        placeholder='Template (optional)'
                        type='text'
                      />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='defaultTags'
                  render={({ field }) => (
                    <FormItem>
                      <Input
                        {...field}
                        placeholder='Default tags (optional)'
                        type='text'
                      />
                    </FormItem>
                  )}
                />
              </div>

              <DrawerFooter>
                <Button type='submit'>
                  <div className='truncate'>
                    {$mirrorBucket && $sourceBucket ? `Link ${bucketTypeName($mirrorBucket.bucketType)} to ${bucketTypeName($sourceBucket.bucketType)}` : 'Link Buckets'}
                  </div>
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
