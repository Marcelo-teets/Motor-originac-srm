import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import './styles/app.css';
import './styles/states.css';
import './styles/fidc-market-map.css';
import './styles/auth-profile.css';
import './styles/dcm-daily.css';
import './styles/ux-v3.css';
import './styles/ux-v4.css';
import './styles/task-center-v2.css';
import './styles/hardening.css';
import './styles/simple-mode.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz da aplicação não foi encontrado.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
