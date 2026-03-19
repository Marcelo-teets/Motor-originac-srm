import { Link } from 'react-router-dom';

function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-panel login-panel-primary">
        <p className="eyebrow">motor-originacao</p>
        <h1>Centralize a operação comercial em um único dashboard.</h1>
        <p>
          Acompanhe pipeline, propostas, clientes e indicadores com uma experiência pronta
          para evoluir com backend e APIs.
        </p>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <h2>Entrar</h2>
          <p>Use qualquer e-mail e senha para navegar pelo protótipo.</p>

          <form className="form-grid">
            <label>
              E-mail
              <input type="email" placeholder="seuemail@empresa.com" />
            </label>
            <label>
              Senha
              <input type="password" placeholder="••••••••" />
            </label>
            <Link className="primary-button" to="/dashboard">
              Acessar plataforma
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
