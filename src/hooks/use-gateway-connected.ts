import { useQuery } from '@tanstack/react-query'
import { fetchGatewayStatus } from '@/screens/chat/chat-queries'

export function useGatewayConnected() {
  const query = useQuery({
    queryKey: ['gateway', 'connection-state'],
    queryFn: fetchGatewayStatus,
    retry: false,
    refetchInterval: 30_000,
  })

  return {
    ...query,
    connected: query.data?.ok === true,
  }
}
