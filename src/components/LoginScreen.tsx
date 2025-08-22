import React, { useState } from 'react';
import { Lock, User, Thermometer, Snowflake } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (username: string, password: string) => void;
  error: string;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, error }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 rounded-full shadow-lg">
              <div className="relative">
                <Snowflake className="h-10 w-10 text-white" />
                <Thermometer className="h-6 w-6 text-white absolute -bottom-1 -right-1" />
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {import.meta.env.VITE_APP_NAME || 'Sistema de Monitoreo'}
          </h1>
          <h2 className="text-2xl font-semibold text-blue-200 mb-2">
            Sistema de Cadena de Frío
          </h2>
          <p className="text-blue-100 text-sm">
            Panel de Control v{import.meta.env.VITE_APP_VERSION || '1.0'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-200 h-5 w-5" />
            <input
              type="text"
              placeholder="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-200 h-5 w-5" />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-100 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg relative overflow-hidden group"
          >
            <span className="absolute right-0 top-0 h-full w-12 translate-x-12 transform bg-white opacity-10 transition-all duration-1000 group-hover:-translate-x-40"></span>
            Iniciar Sesión
          </button>
        </form>

        <div className="mt-6 text-center text-blue-200 text-xs">
          <p className="mt-2">Desarrollado para {import.meta.env.VITE_COMPANY_NAME || 'Tu Empresa'}</p>
          <p className="mt-1">Monitoreo de Cadena de Frío para Productos Lácteos</p>
          <p className="mt-3 text-blue-300 font-semibold">© 2025 {import.meta.env.VITE_COMPANY_NAME || 'Tu Empresa'}</p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;