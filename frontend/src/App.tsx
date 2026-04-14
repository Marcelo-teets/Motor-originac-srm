import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './lib/auth';
import { AgentsPage } from './pages/AgentsPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyDetailPage } from './pages/CompanyDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { PipelinePage } from './pages/PipelinePage';
import { SearchProfilesPage } from './pages/SearchProfilesPage';
import { SourcesPage } from './pages/SourcesPage';
import { WatchListPage } from './pages/WatchListPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={(
          <RequireAuth>
            <Layout />
          </RequireAuth>
        )}
      >
        <Route index element={<DashboardPage />} />
        <Route path="search-profiles" element={<SearchProfilesPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="companies/:id" element={<CompanyDetailPage />} />
        <Route path="watch-lists" element={<WatchListPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
