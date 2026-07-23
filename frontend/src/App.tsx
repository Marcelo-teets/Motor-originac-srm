import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './lib/auth';
import { AgentsPage } from './pages/AgentsPage';
import { CaptureInboxPage } from './pages/CaptureInboxPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyDetailKnowledgePage } from './pages/CompanyDetailKnowledgePage';
import { DashboardPage } from './pages/DashboardPage';
import { FidcMarketMapPage } from './pages/FidcMarketMapPage';
import { KnowledgeVaultPage } from './pages/KnowledgeVaultPage';
import { LoginPage } from './pages/LoginPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { OriginationOsPage } from './pages/OriginationOsPage';
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
        <Route path="companies/:id" element={<CompanyDetailKnowledgePage />} />
        <Route path="market-map" element={<FidcMarketMapPage />} />
        <Route path="watch-lists" element={<WatchListPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="capture-inbox" element={<CaptureInboxPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="origination-os" element={<OriginationOsPage />} />
        <Route path="knowledge-vault" element={<KnowledgeVaultPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
