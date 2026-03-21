export function LoginPage() {
  return (
    <div className="page narrow">
      <section className="hero card">
        <p className="eyebrow">Login</p>
        <h2>Acesse a plataforma de originação estruturada</h2>
        <p>Fluxo atual em modo demo, sincronizado com endpoint mock `/auth/login` até integração real com Supabase Auth.</p>
        <form className="form-grid">
          <label><span>E-mail</span><input defaultValue="demo@motor.com" /></label>
          <label><span>Senha</span><input type="password" defaultValue="123456" /></label>
          <button type="button">Entrar</button>
        </form>
      </section>
    </div>
  );
}
