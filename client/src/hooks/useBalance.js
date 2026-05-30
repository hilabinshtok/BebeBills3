import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useBalance() {
  return useQuery({
    queryKey: ['balance'],
    queryFn: () => api.get('/expenses/balance'),
    refetchInterval: 30000
  });
}
