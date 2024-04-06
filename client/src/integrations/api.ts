import { useRequiredAuth } from '@/auth/hooks'
import type { Integration } from '@/types'
import { authorizationHeaders, callApi } from '@/utils/api'
import { useMutation, useQuery } from '@tanstack/react-query'

export const useIntegrationsQuery = () => {
  const { authToken } = useRequiredAuth()

  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const response = await callApi('/integrations', {
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

type CreateIntegrationInput = {
  integrationType: string
  name: string
  metadata: unknown
}

export const useCreateIntegrationMutation = () => {
  const { authToken } = useRequiredAuth()

  return useMutation({
    mutationFn: async (input: CreateIntegrationInput) => {
      await callApi('/integrations', {
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

export const useDeleteIntegrationMutation = () => {
  const { authToken } = useRequiredAuth()

  return useMutation({
    mutationFn: async (id: number) => {
      await callApi(`/integrations/${id}`, {
        method: 'DELETE',
        headers: authorizationHeaders(authToken),
      })
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserialize(raw: any): Integration {
  return {
    id: raw.id,
    userId: raw.userId,
    name: raw.name,
    queryId: raw.queryId,
    integrationType: raw.integrationType,
    metadata: raw.metadata,
  }
}

