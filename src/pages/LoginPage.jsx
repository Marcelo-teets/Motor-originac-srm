import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';

const initialState = {
  email: '',
  password: '',
};

export default function LoginPage() {
  const [form, setForm] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState('');
  const navigate = useNavigate();

  const stats = useMemo(
    () => [
      { label: 'Propostas em pipeline', value: '+128' },
      { label: 'Tempo médio de análise', value: '2,3 dias' },
      { label: 'Taxa de conversão', value: '38%' },
    ],
    [],
  );

  function validate() {
    const nextErrors = {};

    if (!form.email.trim()) {
      nextErrors.email = 'Informe seu e-mail corporativo.';
    }

    if (!form.password.trim()) {
      nextErrors.password = 'Informe sua senha.';
    } else if (form.password.length < 6) {
      nextErrors.password = 'A senha deve ter ao menos 6 caracteres.';
    }

    return nextErrors;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      setFeedback('Revise os campos obrigatórios para continuar.');
      return;
    }

    setFeedback('Login validado com sucesso. Redirecionando para o dashboard...');
    setTimeout(() => navigate('/dashboard'), 500);
  }

  return (
    <div className="auth-page">
      <section className="auth-page__hero">
        <span className="auth-page__eyebrow">Motor Originação SRM</span>
        <h1>Originação com visão operacional, governança e cara de produto SaaS.</h1>
        <p>
          Centralize clientes, pipeline, análise e acompanhamento de propostas em uma interface pronta para a
          operação comercial e de crédito.
        </p>
        <div className="auth-page__stats">
          {stats.map((item) => (
            <div key={item.label} className="auth-page__stat">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <Card className="auth-card" title="Entrar na plataforma" subtitle="Acesse o ambiente de originação.">
        <form className="auth-form" onSubmit={handleSubmit}>
          <Input
            id="email"
            label="E-mail"
            placeholder="voce@empresa.com"
            type="email"
            value={form.email}
            error={errors.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          />
          <Input
            id="password"
            label="Senha"
            placeholder="••••••••"
            type="password"
            value={form.password}
            error={errors.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
          {feedback && <div className={`form-feedback ${Object.keys(errors).length ? 'form-feedback--error' : 'form-feedback--success'}`}>{feedback}</div>}
          <Button type="submit" fullWidth>
            Acessar workspace
          </Button>
        </form>
      </Card>
    </div>
  );
}
