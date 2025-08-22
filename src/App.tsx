import React, { useState } from 'react';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleLogin = (username: string, password: string) => {
    // Validar credenciales
    if (username === 'admin' && password === 'password') {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Credenciales incorrectas. Intente nuevamente.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setLoginError('');
  };

  return (
    <div className="App">
      {isAuthenticated ? (
        <Dashboard onLogout={handleLogout} />
      ) : (
        <LoginScreen onLogin={handleLogin} error={loginError} />
      )}
    </div>
  );
}

export default App;