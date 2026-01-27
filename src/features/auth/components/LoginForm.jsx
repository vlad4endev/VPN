import Footer from '../../../shared/components/Footer.jsx'

const LoginForm = ({ 
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
  onGoogleSignIn,
  googleSignInLoading,
  onSetView
}) => {
  
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950 bg-responsive" style={{ backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800/50 rounded-[3rem] p-10 shadow-2xl backdrop-blur-xl">
      <div className="text-center mb-10">
        <h2 className="text-4xl font-black text-white mb-2 tracking-tight italic">{authMode === 'login' ? 'Вход' : 'Регистрация'}</h2>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">SKYPATH VPN System</p>
        </div>

        {error && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-2xl text-red-300 text-sm font-medium">
            {error}
          </div>
        )}

        {success && (
        <div className="mb-4 p-4 bg-green-900/30 border border-green-800 rounded-2xl text-green-300 text-sm font-medium">
            {success}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <button
          onClick={onAuthModeLogin}
          className={`flex-1 py-3 px-4 rounded-2xl transition-all font-bold ${
              authMode === 'login'
              ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Вход
          </button>
          <button
          onClick={onAuthModeRegister}
          className={`flex-1 py-3 px-4 rounded-2xl transition-all font-bold ${
              authMode === 'register'
              ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={(e) => {
          console.log('📝 Форма отправлена', { authMode, event: e })
          if (authMode === 'login') {
            console.log('📝 Вызываем handleLogin')
            onLogin(e)
          } else {
            console.log('📝 Вызываем handleRegister')
            onRegister(e)
          }
        }}>
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-xs font-black text-slate-500 ml-5 uppercase tracking-widest">Email</label>
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="email"
              value={loginData.email}
              onChange={onEmailChange}
              className="w-full bg-slate-950/50 border border-slate-800 p-5 rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all"
              placeholder="user@skyputh.com"
              required
            />
          </div>

          {authMode === 'register' && (
            <div className="space-y-2">
              <label htmlFor="register-name" className="text-xs font-black text-slate-500 ml-5 uppercase tracking-widest">Имя</label>
              <input
                key="register-name-input"
                id="register-name"
                type="text"
                name="name"
                autoComplete="name"
                value={loginData.name || ''}
                onChange={onNameChange}
                className="w-full bg-slate-950/50 border border-slate-800 p-5 rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all"
                placeholder="Ваше имя"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor={`${authMode}-password`} className="text-xs font-black text-slate-500 ml-5 uppercase tracking-widest">Пароль</label>
            <input
              id={`${authMode}-password`}
              type="password"
              name="password"
              autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
              value={loginData.password}
              onChange={onPasswordChange}
              className="w-full bg-slate-950/50 border border-slate-800 p-5 rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-3xl font-black text-white text-xl transition-all shadow-2xl shadow-blue-600/30 active:scale-95"
          >
            {authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
          </div>
        </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-slate-900/80 text-slate-500 font-bold uppercase text-xs tracking-widest">или</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onGoogleSignIn}
          disabled={googleSignInLoading}
          className="w-full mt-6 bg-white hover:bg-gray-100 disabled:bg-gray-300 disabled:cursor-not-allowed text-gray-900 py-4 rounded-3xl font-bold text-lg transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {googleSignInLoading ? 'Вход...' : 'Войти через Google'}
        </button>
      </div>
        <button 
          onClick={() => {
            if (onSetView) {
              onSetView('landing')
            }
          }} 
          className="w-full mt-8 text-slate-600 text-xs font-bold hover:text-blue-400 transition-colors hover:underline"
        >
          Вернуться на главную
        </button>
        </div>
      </div>
      <div className="max-sm:hidden">
        <Footer />
      </div>
    </div>
  )
}

export default LoginForm

