import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useUIStore = create(
  persist(
    (set) => ({
      // Текущий view (landing, dashboard, admin)
      view: 'landing',
      setView: (view) => set({ view }),

      // Модальные окна
      showKeyModal: false,
      setShowKeyModal: (show) => set({ showKeyModal: show }),

      showLogger: false,
      setShowLogger: (show) => set({ showLogger }),

      // Табы в админ-панели
      adminTab: 'users',
      setAdminTab: (tab) => set({ adminTab: tab }),

      // Табы в dashboard
      dashboardTab: 'subscription',
      setDashboardTab: (tab) => set({ dashboardTab: tab }),

      // Режимы редактирования
      editingUser: null,
      setEditingUser: (user) => set({ editingUser: user }),

      editingServer: null,
      setEditingServer: (server) => set({ editingServer: server }),

      editingTariff: null,
      setEditingTariff: (tariff) => set({ editingTariff: tariff }),

      editingProfile: false,
      setEditingProfile: (editing) => set({ editingProfile: editing }),

      // Временные данные форм
      profileData: { name: '', phone: '' },
      setProfileData: (data) => set({ profileData: data }),

      // Сообщения
      success: '',
      setSuccess: (message) => set({ success: message }),
      error: '',
      setError: (message) => set({ error: message }),

      // Очистка сообщений
      clearMessages: () => set({ success: '', error: '' }),
    }),
    {
      name: 'vpn-ui-storage',
      // Сохраняем только view и табы
      partialize: (state) => ({
        view: state.view,
        adminTab: state.adminTab,
        dashboardTab: state.dashboardTab,
      }),
    }
  )
)

