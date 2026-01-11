import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Время, после которого данные считаются устаревшими
      staleTime: 5 * 60 * 1000, // 5 минут
      // Время хранения неиспользуемых данных в кеше
      gcTime: 10 * 60 * 1000, // 10 минут (ранее cacheTime)
      // Автоматический refetch при фокусе окна
      refetchOnWindowFocus: true,
      // Retry при ошибках
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch при переподключении
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry для мутаций
      retry: 1,
    },
  },
})

