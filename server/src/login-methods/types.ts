export type LoginMethod = {
  id: number
  userId: number
  name: string
  queryId: string
} & ({
  loginMethodType: 'telegram'
  metadata: {
    userId: number
  }
})

export type LoginMethodType = LoginMethod['loginMethodType']
