import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export function useSettlements() {
  return useQuery({ queryKey: ['settlements'], queryFn: () => api.get('/settlements') });
}

export function useCreateSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/settlements', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
    }
  });
}

export function useDeleteSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/settlements/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
    }
  });
}
