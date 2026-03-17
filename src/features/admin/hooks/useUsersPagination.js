import { useState, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase/client.js'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'

export function useUsersPagination(filters = {}) {
  const pageSize = 20
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [isFirstPage, setIsFirstPage] = useState(true)
  const pageRef = useRef(0)

  if (!supabase) {
    return {
      data: [], loading: false, error: 'База данных недоступна',
      hasMore: false, isFirstPage: true, canGoBack: false,
      loadNextPage: () => {}, loadPreviousPage: () => {},
      reset: () => {}, reload: () => {},
    }
  }

  const loadPage = useCallback(async (page) => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase
        .from('vpn_users')
        .select('*')
        .eq('app_id', APP_ID)
        .order('source_created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize)

      if (filters.role) q = q.eq('role', filters.role)

      const { data: rows, error: fetchErr } = await q
      if (fetchErr) throw fetchErr

      const mapped = (rows || []).map((r) => ({
        id: r.uid,
        email: r.email,
        name: r.name,
        phone: r.phone,
        role: r.role,
        plan: r.plan,
        uuid: r.uuid,
        subId: r.sub_id,
        expiresAt: r.expires_at,
        tariffId: r.tariff_id,
        tariffName: r.tariff_name,
        photoURL: r.photo_url,
        language: r.language,
        createdAt: r.source_created_at,
        updatedAt: r.source_updated_at,
        ...(r.raw || {}),
      }))

      setData(mapped)
      setHasMore(rows && rows.length > pageSize)
      setIsFirstPage(page === 0)
      pageRef.current = page
    } catch (err) {
      logger.error('Pagination', 'Ошибка загрузки страницы', null, err)
      setError(err.message || 'Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }, [filters.role])

  const loadNextPage = useCallback(() => {
    if (loading || !hasMore) return
    loadPage(pageRef.current + (isFirstPage && data.length === 0 ? 0 : 1))
  }, [loading, hasMore, isFirstPage, data.length, loadPage])

  const loadPreviousPage = useCallback(() => {
    if (loading || pageRef.current <= 0) return
    loadPage(pageRef.current - 1)
  }, [loading, loadPage])

  const reset = useCallback(() => {
    pageRef.current = 0
    setData([])
    setHasMore(true)
    setIsFirstPage(true)
    setError(null)
  }, [])

  const reload = useCallback(() => {
    reset()
    loadPage(0)
  }, [reset, loadPage])

  return {
    data, loading, error, hasMore, isFirstPage,
    canGoBack: pageRef.current > 0,
    loadNextPage, loadPreviousPage, reset, reload,
  }
}
