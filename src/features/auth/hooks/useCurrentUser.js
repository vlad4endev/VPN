import { useQuery } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'

/**
 * Хук для получения текущего пользователя
 */
export function useCurrentUser() {
  const { auth, db } = useFirebase()
  const [firebaseUser, setFirebaseUser] = useState(null)

  // Отслеживаем изменения авторизации
  useEffect(() => {
    if (!auth) return

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
    })

    return unsubscribe
  }, [auth])

  // Загружаем данные пользователя из Firestore
  const { data: userData, isLoading, error } = useQuery({
    queryKey: ['currentUser', firebaseUser?.uid],
    queryFn: async () => {
      if (!firebaseUser || !db) return null

      const userRef = doc(db, `artifacts/${APP_ID}/users/${firebaseUser.uid}`)
      const snapshot = await getDoc(userRef)

      if (!snapshot.exists()) {
        return {
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || '',
          role: 'user',
          plan: 'free',
        }
      }

      return {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        ...snapshot.data(),
      }
    },
    enabled: !!firebaseUser && !!db,
    staleTime: 1 * 60 * 1000, // 1 минута
  })

  return {
    user: userData,
    isLoading,
    error,
    firebaseUser,
  }
}

