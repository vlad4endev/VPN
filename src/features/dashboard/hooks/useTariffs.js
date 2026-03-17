import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase/client.js'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'

export function useTariffs() {
  return useQuery({
    queryKey: ['tariffs'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase не инициализирован')

      const { data, error } = await supabase
        .from('vpn_tariffs')
        .select('*')
        .eq('app_id', APP_ID)

      if (error) throw error

      const tariffs = (data || []).map((t) => ({
        id: t.id,
        name: t.name,
        price: t.price,
        durationDays: t.duration_days,
        isActive: t.is_active,
        ...(t.raw || {}),
      }))

      const activeTariffs = tariffs
        .filter((t) => t.active !== false && t.isActive !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

      logger.info('Tariffs', 'Тарифы загружены', { total: tariffs.length, active: activeTariffs.length })
      return activeTariffs
    },
    enabled: !!supabase,
    staleTime: 10 * 60 * 1000,
  })
}

export function useSaveTariff() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tariffId, tariff }) => {
      if (!supabase) throw new Error('Supabase не инициализирован')

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Не авторизован')

      const { error } = await supabase
        .from('vpn_tariffs')
        .upsert({
          id: tariffId,
          app_id: APP_ID,
          name: tariff.name,
          price: tariff.price,
          duration_days: tariff.durationDays || tariff.days,
          is_active: tariff.active !== false,
          raw: { ...tariff, updatedAt: new Date().toISOString(), updatedBy: user.id },
          source_updated_at: new Date().toISOString(),
        }, { onConflict: 'app_id,id' })

      if (error) throw error
      logger.info('Tariffs', 'Тариф сохранен', { tariffId })
      return { tariffId, tariff }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariffs'] })
    },
  })
}

export function useDeleteTariff() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tariffId }) => {
      if (!supabase) throw new Error('Supabase не инициализирован')

      const { error } = await supabase
        .from('vpn_tariffs')
        .delete()
        .eq('app_id', APP_ID)
        .eq('id', tariffId)

      if (error) throw error
      logger.info('Tariffs', 'Тариф удален', { tariffId })
      return { tariffId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariffs'] })
    },
  })
}
