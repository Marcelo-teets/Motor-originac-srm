import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ClientesPage from '../pages/ClientesPage';
import DashboardPage from '../pages/DashboardPage';
import LoginPage from '../pages/LoginPage';
import NewProposalPage from '../pages/NewProposalPage';
import NotFoundPage from '../pages/NotFoundPage';
import PipelinePage from '../pages/PipelinePage';
import ProposalDetailPage from '../pages/ProposalDetailPage';

function ProtectedLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
      <Route path="/clientes" element={<ProtectedLayout><ClientesPage /></ProtectedLayout>} />
      <Route path="/propostas/nova" element={<ProtectedLayout><NewProposalPage /></ProtectedLayout>} />
      <Route path="/propostas/:id" element={<ProtectedLayout><ProposalDetailPage /></ProtectedLayout>} />
      <Route path="/pipeline" element={<ProtectedLayout><PipelinePage /></ProtectedLayout>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
