import { useRequiredAuth } from '@/auth/hooks'
import type { Note } from '@/types'
import { callApi, authorizationHeaders } from '@/utils/api'
import { useQuery } from '@tanstack/react-query'

export const useNotesQuery = (bucketId: number | undefined) => {
  const { authToken } = useRequiredAuth()

  return useQuery({
    queryKey: ['notes', bucketId],
    queryFn: async () => {
      if (bucketId === undefined) return null

      const response = await callApi(`/buckets/${bucketId}/notes`, {
        method: 'GET',
        headers: authorizationHeaders(authToken),
      })

      const json = await response.json() as { items: unknown[] }

      return {
        items: json.items as Note[],
      }
    }
  })
}