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
    setTariffs: (tariffs) => set({ tariffs }),

    appState: null, // Project settings, etc.
    setAppState: (state) => set({ appState: state }),

    settings: null,
    setSettings: (settings) => set({ settings }),

    servers: [],
    setServers: (servers) => set({ servers: servers }),

    users: [],
    setUsers: (users) => set({ users })
}))
