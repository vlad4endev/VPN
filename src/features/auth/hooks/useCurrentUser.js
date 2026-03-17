import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase/client.js'
import { APP_ID } from '../../../shared/constants/app.js'

export function useCurrentUser() {
  const [supabaseUser, setSupabaseUser] = useState(null)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getUser().then(({ data }) => {
      setSupabaseUser(data.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const { data: userData, isLoading, error } = useQuery({
    queryKey: ['currentUser', supabaseUser?.id],
    queryFn: async () => {
      if (!supabaseUser || !supabase) return null

      const { data, error } = await supabase
        .from('vpn_users')
        .select('*')
        .eq('uid', supabaseUser.id)
        .eq('app_id', APP_ID)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            id: supabaseUser.id,
            email: supabaseUser.email,
            name: supabaseUser.user_metadata?.full_name || '',
            role: 'user',
            plan: 'free',
          }
        }
        throw error
      }

      return {
        id: data.uid,
        email: data.email || supabaseUser.email,
        name: data.name,
        phone: data.phone,
        role: data.role,
        plan: data.plan,
        uuid: data.uuid,
        subId: data.sub_id,
        expiresAt: data.expires_at,
        tariffId: data.tariff_id,
        tariffName: data.tariff_name,
        photoURL: data.photo_url,
        language: data.language,
        referredBy: data.referred_by,
        createdAt: data.source_created_at,
        updatedAt: data.source_updated_at,
        ...(data.raw || {}),
      }
    },
    enabled: !!supabaseUser,
    staleTime: 60_000,
  })

  return {
    user: userData,
    isLoading,
    error,
    firebaseUser: supabaseUser,
  }
}
