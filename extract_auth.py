import re

with open("src/app/App.jsx", "r") as f:
    app_text = f.read()

# Locate generateUniqueSubId
gen_start = app_text.find("  const generateUniqueSubId = useCallback(async (dbInstance, appIdValue, maxAttempts = 10) => {")
auth_effect_end = app_text.find("  }, [auth, db, loadUserData, generateUniqueSubId])\n") + len("  }, [auth, db, loadUserData, generateUniqueSubId])\n")

if gen_start == -1 or auth_effect_end == -1:
    print("Could not find start or end marks")
    exit(1)

# Extract this whole chunk! It contains generateUniqueSubId, loadUserData, and the useEffect
auth_block = app_text[gen_start:auth_effect_end]

hook_code = """import { useEffect, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, doc, query, where, updateDoc, setDoc } from 'firebase/firestore'
import ThreeXUI from '../../features/vpn/services/ThreeXUI.js'
import { getDb } from '../../lib/firebase/config.js'
import { authService } from '../../features/auth/services/authService.js'
import logger from '../../shared/utils/logger.js'
import i18n from '../../i18n'
import { isAdminEmail } from '../../shared/constants/admin.js'
import { getFirestoreSafeName } from '../../shared/utils/firestoreSafe.js'
import { applyUserLanguageToUi } from '../../features/auth/services/userLanguageService.js'
import { isBrowserAuthPath } from '../../features/telegram/utils/tmaPath.js'

export const useAppAuth = ({
  appId,
  db,
  auth,
  setCurrentUser,
  setView,
  setDashboardTab,
  setLoading,
  setError,
  setAuthChecking,
  getAllowedView,
  firebaseUser,
  setFirebaseUser,
  signInInProgressRef
}) => {
""" + auth_block + """

  return { generateUniqueSubId, loadUserData }
}
"""

with open("src/app/hooks/useAppAuth.js", "w") as f:
    f.write(hook_code)

# Now remove the block from App.jsx and insert hook call
new_app_text = app_text[:gen_start] + """
  const { generateUniqueSubId, loadUserData } = useAppAuth({
    appId,
    db,
    auth,
    setCurrentUser,
    setView,
    setDashboardTab,
    setLoading,
    setError,
    setAuthChecking,
    getAllowedView,
    firebaseUser,
    setFirebaseUser,
    signInInProgressRef
  })
""" + app_text[auth_effect_end:]

# Also add import for useAppAuth
if "import { useAppAuth }" not in new_app_text:
    new_app_text = new_app_text.replace(
        "import { useTelegramInit } from './hooks/useTelegramInit.js'",
        "import { useTelegramInit } from './hooks/useTelegramInit.js'\nimport { useAppAuth } from './hooks/useAppAuth.js'"
    )

with open("src/app/App.jsx", "w") as f:
    f.write(new_app_text)

print("Extraction successful")
