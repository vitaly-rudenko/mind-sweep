import { useRequiredAuth } from '@/auth/hooks'
import type { Bucket, Link } from '@/types'
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
        items: json.items as ({ bucket: Bucket; sourceLinks: Link[] })[],
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

type CreateLinkInput = {
  sourceBucketId: number
  mirrorBucketId: number
  priority: number
  template?: string
  defaultTags?: string[]
}

export const useCreateLinkMutation = () => {
  const { authToken } = useRequiredAuth()

  return useMutation({
    mutationFn: async (input: CreateLinkInput) => {
      await callApi('/links', {
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

export const useDeleteLinkMutation = () => {
  const { authToken } = useRequiredAuth()

  return useMutation({
    mutationFn: async (id: number) => {
      await callApi(`/links/${id}`, {
        method: 'DELETE',
        headers: authorizationHeaders(authToken),
      })
    }
  })
}


export const useSyncLinkMutation = () => {
  const { authToken } = useRequiredAuth()

  return useMutation({
    mutationFn: async (id: number) => {
      await callApi(`/links/${id}/sync`, {
        method: 'POST',
        headers: authorizationHeaders(authToken),
      })
    }
  })
}
