import { Card, CardContent, CardHeader, CardTitle } from '@/components/card'
import { Separator } from '@/components/separator'
import { cn } from '@/utils/cn'
import { useState, type FC, type ReactNode } from 'react'

export const Notes: FC = () => {
  return <div className='flex flex-col gap-3'>
    <Bucket title='Slipbox'>
      <Note>Go to the pharmacy</Note>
      <Note>Buy bananas</Note>
    </Bucket>

    <Bucket title='Personal'>
      <Tag>
        <Note>Send money to family</Note>
      </Tag>

      <Separator />

      <Tag title='home'>
        <Note completed>Clean mirrors</Note>
        <Note>Water plants</Note>
      </Tag>

      <Separator />

      <Tag title='groceries'>
        <Note>Buy milk</Note>
      </Tag>
    </Bucket>

    <Bucket title='Work'>
      <Tag title='sync'>
        <Note>Test on dev</Note>
      </Tag>

      <Separator />

      <Tag title='goals'>
        <Note>Add new filters</Note>
        <Note completed>
          <p>Allow removing goals</p>
          <p>Also test removing of non-existing goals</p>
        </Note>
      </Tag>
    </Bucket>
  </div>
}

const Bucket: FC<{ children: ReactNode; title: string }> = ({ children, title }) => {
  const [visible, setVisible] = useState(true)

  return <Card>
    <CardHeader>
      <CardTitle className='cursor-pointer transition-colors hover:text-primary/70' onClick={() => setVisible(!visible)}>
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className={cn('flex flex-col gap-3 animation-top-down', !visible && 'hidden')}>
      {children}
    </CardContent>
  </Card>
}

const Tag: FC<{ children: ReactNode; title?: string }> = ({ children, title }) => {
  const [visible, setVisible] = useState(true)

  return <div className='flex flex-col gap-2'>
    <div className='cursor-pointer font-medium transition-colors hover:text-primary/70' onClick={() => setVisible(!visible)}>
      {title ? `#${title}` : 'Untagged'}
    </div>
    <div className={cn('flex flex-col gap-1 animation-top-down', !visible && 'hidden')}>{children}</div>
  </div>
}

const Note: FC<{ children?: ReactNode; completed?: boolean }> = ({ children, completed = false }) => {
  return <div className='flex flex-row gap-1'>
    <div className='flex shrink-0 grow-0'>•</div>
    <div className={cn(completed && 'line-through')}>{children}</div>
  </div>
}
