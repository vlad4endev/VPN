import { useEffect } from 'react'
import LoginForm from '../components/LoginForm.jsx'

const LoginPage = ({
  authMode,
  loginData,
  error,
  success,
  onEmailChange,
  onPasswordChange,
  onNameChange,
  onAuthModeLogin,
  onAuthModeRegister,
  onLogin,
  onRegister,
}) => {
  // Устанавливаем режим входа при монтировании
  useEffect(() => {
    onAuthModeLogin()
  }, [onAuthModeLogin])

  return (
    <LoginForm
      authMode={authMode}
      loginData={loginData}
      error={error}
      success={success}
      onEmailChange={onEmailChange}
      onPasswordChange={onPasswordChange}
      onNameChange={onNameChange}
      onAuthModeLogin={onAuthModeLogin}
      onAuthModeRegister={onAuthModeRegister}
      onLogin={onLogin}
      onRegister={onRegister}
      onSetView={() => {}} // Не используется в роутере
    />
  )
}

export default LoginPage

