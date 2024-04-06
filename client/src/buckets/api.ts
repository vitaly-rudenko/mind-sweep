import { useRequiredAuth } from '@/auth/hooks'
import type { Bucket } from '@/types'
import { authorizationHeaders, callApi } from '@/utils/api'
import { useMutation, useQuery } from '@tanstack/react-query'

export const useBucketsQuery = () => {
  const { authToken } = useRequiredAuth()

  return useQuery({
    queryKey: ['buckets'],
    queryFn: async () => {
      const response = await callApi('/buckets', {
        method: 'GET',
        headers: authorizationHeaders(authToken),
      })

      const json = await response.json() as { items: unknown[] }

      return {
        items: json.items.map(deserialize),
      }
    }
  })

}

type CreateBucketInput = {
  integrationId: number
  bucketType: string
  name: string
  metadata: unknown
}

export const useCreateBucketMutation = () => {
  const { authToken } = useRequiredAuth()

  return useMutation({
    mutationFn: async (input: CreateBucketInput) => {
      await callApi('/buckets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authorizationHeaders(authToken),
        },
        body: JSON.stringify(input),
      })
    }
  })
}

export const useDeleteBucketMutation = () => {
  const { authToken } = useRequiredAuth()

  return useMutation({
    mutationFn: async (id: number) => {
      await callApi(`/buckets/${id}`, {
        method: 'DELETE',
        headers: authorizationHeaders(authToken),
      })
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserialize(raw: any): Bucket {
  return {
    id: raw.id,
    name: raw.name,
    userId: raw.userId,
    queryId: raw.queryId,
    bucketType: raw.bucketType,
    metadata: raw.metadata,
    integrationId: raw.integrationId,
  }
}

