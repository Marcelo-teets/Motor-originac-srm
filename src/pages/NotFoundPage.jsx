import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <div className="not-found-page__content">
        <span>404</span>
        <h1>Página não encontrada</h1>
        <p>A rota acessada não existe nesta versão do frontend. Retorne para o fluxo principal.</p>
        <Button onClick={() => navigate('/dashboard')}>Ir para o dashboard</Button>
      </div>
    </div>
  );
}
