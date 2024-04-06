import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/card'
import { ArrowRight } from 'lucide-react'
import type { FC } from 'react'
import { BucketCombobox } from './bucket-combobox'

export const Links: FC = () => {
  return <div className='flex flex-col gap-2'>
    <div>Links</div>
    <div className='flex flex-col gap-2'>
      <Link />
      <Link />
      <Link />
      <Link />
    </div>
  </div>
}

const Link: FC = () => {
  return <Card className='bg-secondary'>
    <CardHeader>
      <CardTitle className='flex items-baseline gap-2'>
        <div>John (@johndoe)</div>
        <CardDescription>Telegram chat</CardDescription>
      </CardTitle>
    </CardHeader>
    {randomEnabled() && <CardContent>
      <div className='flex flex-col gap-2'>
        <SubLink />
        {randomEnabled() && <SubLink />}
        {randomEnabled() && <SubLink />}
      </div>
    </CardContent>}
    <CardFooter>
      <div className='flex flex-row items-center justify-stretch gap-2'>
        <ArrowRight className='inline size-6' />
        <BucketCombobox />
      </div>
    </CardFooter>
  </Card>
}

const SubLink: FC = () => {
  return <div className='flex flex-row items-center gap-2'>
    <ArrowRight className='inline size-6' />
    <Card className='grow'>
      <CardHeader>
        <CardTitle className='flex items-baseline gap-2'>
          <div>Work</div>
          <CardDescription>Notion database</CardDescription>
        </CardTitle>
      </CardHeader>
      {randomEnabled() && <CardContent>
        <div className='text-sm font-mono'>{"Let's work on {Note:text}"}</div>
        {randomEnabled() && <div className='text-sm'>#work #tasks</div>}
      </CardContent>}
    </Card>
  </div>
}

function randomEnabled() {
  return Math.random() > 0.5
}
