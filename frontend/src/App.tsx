import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { CompanyDecisionReadinessBoundary } from './components/CompanyDecisionReadinessBoundary';
import { Layout } from './components/Layout';
import { RequireAuth, RequireGodMode } from './lib/auth';
import { AgentsPage } from './pages/AgentsPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { CandidateIdentityReviewPage } from './pages/CandidateIdentityReviewPage';
import { CaptureInboxPage } from './pages/CaptureInboxPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyDetailKnowledgePage } from './pages/CompanyDetailKnowledgePage';
import { DashboardPage } from './pages/DashboardPage';
import { FidcMarketMapPage } from './pages/FidcMarketMapPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { KnowledgeSearchPage } from './pages/KnowledgeSearchPage';
import { KnowledgeVaultPage } from './pages/KnowledgeVaultPage';
import { LoginPage } from './pages/LoginPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { OriginationOsPage } from './pages/OriginationOsPage';
import { OutcomeOperationsPage } from './pages/OutcomeOperationsPage';
import { PipelinePage } from './pages/PipelinePage';
import { ProfilePage } from './pages/ProfilePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SearchProfilesPage } from './pages/SearchProfilesPage';
import { SourcesPage } from './pages/SourcesPage';
import { UsersPage } from './pages/UsersPage';
import { WatchListPage } from './pages/WatchListPage';

const portfolioGate = (children: ReactNode) => (
  <CompanyDecisionReadinessBoundary>{children}</CompanyDecisionReadinessBoundary>
);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/"
        element={(
          <RequireAuth>
            <Layout />
          </RequireAuth>
        )}
      >
        <Route index element={portfolioGate(<DashboardPage />)} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="change-password" element={<ChangePasswordPage />} />
        <Route path="users" element={<RequireGodMode><UsersPage /></RequireGodMode>} />
        <Route path="search-profiles" element={<SearchProfilesPage />} />
        <Route path="companies" element={portfolioGate(<CompaniesPage />)} />
        <Route path="companies/:id" element={<CompanyDecisionReadinessBoundary scope="company"><CompanyDetailKnowledgePage /></CompanyDecisionReadinessBoundary>} />
        <Route path="market-map" element={<FidcMarketMapPage />} />
        <Route path="watch-lists" element={portfolioGate(<WatchListPage />)} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="capture-inbox" element={<CaptureInboxPage />} />
        <Route path="identity-review" element={<RequireGodMode><CandidateIdentityReviewPage /></RequireGodMode>} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="origination-os" element={<OriginationOsPage />} />
        <Route path="knowledge-vault" element={<KnowledgeVaultPage />} />
        <Route path="knowledge-search" element={<KnowledgeSearchPage />} />
        <Route path="outcome-operations" element={<OutcomeOperationsPage />} />
        <Route path="pipeline" element={portfolioGate(<PipelinePage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
