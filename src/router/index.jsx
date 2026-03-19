import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import DashboardPage from '../pages/DashboardPage';
import LoginPage from '../pages/LoginPage';
import NewProposalPage from '../pages/NewProposalPage';
import ClientsPage from '../pages/ClientsPage';
import PipelinePage from '../pages/PipelinePage';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'nova-proposta',
        element: <NewProposalPage />,
      },
      {
        path: 'clientes',
        element: <ClientsPage />,
      },
      {
        path: 'pipeline',
        element: <PipelinePage />,
      },
    ],
  },
]);

export default router;
