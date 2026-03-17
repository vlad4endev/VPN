import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase/client.js'
import { APP_ID } from '../../../shared/constants/app.js'

export function usePayments(userId) {
  return useQuery({
    queryKey: ['payments', userId],
    queryFn: async () => {
      if (!supabase || !userId) return []

      const { data, error } = await supabase
        .from('vpn_payments')
        .select('*')
        .eq('app_id', APP_ID)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      return (data || []).map((p) => ({
        id: p.id,
        userId: p.user_id,
        amount: p.amount,
        status: p.status,
        provider: p.provider,
        tariffId: p.tariff_id,
        createdAt: p.created_at,
        paidAt: p.paid_at,
        ...(p.raw || {}),
      }))
    },
    enabled: !!supabase && !!userId,
    staleTime: 2 * 60 * 1000,
  })
}
