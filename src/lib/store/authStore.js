import { create } from 'zustand'

export const useAuthStore = create((set) => ({
    currentUser: null,
    setCurrentUser: (user) => set({ currentUser: user }),

    sessionStatus: 'initializing', // 'initializing', 'authenticated', 'unauthenticated'
    setSessionStatus: (status) => set({ sessionStatus: status }),

    logout: () => set({ currentUser: null, sessionStatus: 'unauthenticated' })
}))
