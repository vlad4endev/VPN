import { create } from 'zustand'

export const useAppStore = create((set) => ({
    // Telegram Mini App state
    isTelegramMini: false,
    setIsTelegramMini: (isTMA) => set({ isTelegramMini: isTMA }),

    tmaInitData: null,
    setTmaInitData: (data) => set({ tmaInitData: data }),

    tmaInitDataUnsafe: null,
    setTmaInitDataUnsafe: (data) => set({ tmaInitDataUnsafe: data }),

    // Global settings & tariffs
    tariffs: [],
    setTariffs: (valueOrUpdater) =>
      set((state) => ({
        tariffs: typeof valueOrUpdater === 'function' ? valueOrUpdater(state.tariffs) : valueOrUpdater,
      })),

    appState: null, // Project settings, etc.
    setAppState: (valueOrUpdater) =>
      set((state) => ({
        appState: typeof valueOrUpdater === 'function' ? valueOrUpdater(state.appState) : valueOrUpdater,
      })),

    settings: null,
    setSettings: (valueOrUpdater) =>
      set((state) => ({
        settings: typeof valueOrUpdater === 'function' ? valueOrUpdater(state.settings) : valueOrUpdater,
      })),

    servers: [],
    setServers: (valueOrUpdater) =>
      set((state) => ({
        servers: typeof valueOrUpdater === 'function' ? valueOrUpdater(state.servers) : valueOrUpdater,
      })),

    users: [],
    setUsers: (valueOrUpdater) =>
      set((state) => ({
        users: typeof valueOrUpdater === 'function' ? valueOrUpdater(state.users) : valueOrUpdater,
      })),
}))
