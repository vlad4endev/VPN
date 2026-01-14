/**
 * Определяет операционную систему пользователя
 * @returns {string} 'android' | 'ios' | 'macos' | 'windows' | 'unknown'
 */
export const detectPlatform = () => {
  if (typeof window === 'undefined' || !navigator) {
    return 'unknown'
  }

  const userAgent = navigator.userAgent || navigator.vendor || window.opera || ''

  // Android должен проверяться первым, так как некоторые Android устройства могут содержать другие строки
  if (/android/i.test(userAgent)) {
    return 'android'
  }

  // iOS (iPad, iPhone, iPod)
  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return 'ios'
  }

  // macOS (Macintosh, MacIntel, MacPPC, Mac68K)
  if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(userAgent)) {
    return 'macos'
  }

  // Windows
  if (/Windows|Win32|Win64|Windows NT/.test(userAgent)) {
    return 'windows'
  }

  // Linux (можно добавить, если нужно)
  if (/Linux/.test(userAgent) && !/Android/.test(userAgent)) {
    // Linux обычно не имеет мобильного приложения, но можно вернуть 'unknown' или добавить поддержку
    return 'unknown'
  }

  return 'unknown'
}

/**
 * Получает информацию о платформе для отображения
 * @returns {Object} { platform: string, label: string, icon: Component }
 */
export const getPlatformInfo = (platform) => {
  const platforms = {
    android: {
      label: 'Android',
      icon: 'Smartphone',
      color: 'green-400',
    },
    ios: {
      label: 'iOS',
      icon: 'Apple',
      color: 'gray-300',
    },
    macos: {
      label: 'macOS',
      icon: 'Laptop',
      color: 'gray-300',
    },
    windows: {
      label: 'Windows',
      icon: 'Monitor',
      color: 'blue-400',
    },
  }

  return platforms[platform] || {
    label: 'Ваше устройство',
    icon: 'Download',
    color: 'slate-400',
  }
}
