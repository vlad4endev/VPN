import { useEffect } from 'react'
import LoginForm from '../components/LoginForm.jsx'

const RegisterPage = ({
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
  // Устанавливаем режим регистрации при монтировании
  useEffect(() => {
    onAuthModeRegister()
  }, [onAuthModeRegister])

  return (
    <LoginForm
      authMode="register"
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

export default RegisterPage

