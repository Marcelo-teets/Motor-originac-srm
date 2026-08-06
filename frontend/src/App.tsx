import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { CompanyDecisionReadinessBoundary } from './components/CompanyDecisionReadinessBoundary';
import { Layout } from './components/Layout';
import { LoadingState } from './components/UI';
import { RequireAuth, RequireGodMode } from './lib/auth';
import { NotFoundPage } from './pages/NotFoundPage';

const AgentsPage = lazy(() => import('./pages/AgentsPage').then((module) => ({ default: module.AgentsPage })));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage').then((module) => ({ default: module.AuthCallbackPage })));
const CandidateDecisionQueuePage = lazy(() => import('./pages/CandidateDecisionQueuePage').then((module) => ({ default: module.CandidateDecisionQueuePage })));
const CandidateIdentityReviewPage = lazy(() => import('./pages/CandidateIdentityReviewPage').then((module) => ({ default: module.CandidateIdentityReviewPage })));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage').then((module) => ({ default: module.ChangePasswordPage })));
const CompaniesPage = lazy(() => import('./pages/CompaniesPage').then((module) => ({ default: module.CompaniesPage })));
const CompanyCreditReviewPage = lazy(() => import('./pages/CompanyCreditReviewPage').then((module) => ({ default: module.CompanyCreditReviewPage })));
const CompanyDetailKnowledgePage = lazy(() => import('./pages/CompanyDetailKnowledgePage').then((module) => ({ default: module.CompanyDetailKnowledgePage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const DcmDailyOutreachPage = lazy(() => import('./pages/DcmDailyOutreachPage').then((module) => ({ default: module.DcmDailyOutreachPage })));
const FidcMarketMapPage = lazy(() => import('./pages/FidcMarketMapPage').then((module) => ({ default: module.FidcMarketMapPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })));
const HistoricalArchivePage = lazy(() => import('./pages/HistoricalArchivePage').then((module) => ({ default: module.HistoricalArchivePage })));
const KnowledgeLearningAgentPage = lazy(() => import('./pages/KnowledgeLearningAgentPage').then((module) => ({ default: module.KnowledgeLearningAgentPage })));
const KnowledgeSearchPage = lazy(() => import('./pages/KnowledgeSearchPage').then((module) => ({ default: module.KnowledgeSearchPage })));
const KnowledgeVaultPage = lazy(() => import('./pages/KnowledgeVaultPage').then((module) => ({ default: module.KnowledgeVaultPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage').then((module) => ({ default: module.MonitoringPage })));
const OriginationOsPage = lazy(() => import('./pages/OriginationOsPage').then((module) => ({ default: module.OriginationOsPage })));
const OutcomeOperationsPage = lazy(() => import('./pages/OutcomeOperationsPage').then((module) => ({ default: module.OutcomeOperationsPage })));
const PipelinePage = lazy(() => import('./pages/PipelinePage').then((module) => ({ default: module.PipelinePage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const QuickSearchPage = lazy(() => import('./pages/QuickSearchPage').then((module) => ({ default: module.QuickSearchPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })));
const SearchProfilesPage = lazy(() => import('./pages/SearchProfilesPage').then((module) => ({ default: module.SearchProfilesPage })));
const SourcesPage = lazy(() => import('./pages/SourcesPage').then((module) => ({ default: module.SourcesPage })));
const TaskCenterWithAiPage = lazy(() => import('./pages/TaskCenterWithAiPage').then((module) => ({ default: module.TaskCenterWithAiPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((module) => ({ default: module.UsersPage })));
const WatchListPage = lazy(() => import('./pages/WatchListPage').then((module) => ({ default: module.WatchListPage })));

const portfolioGate = (children: ReactNode) => (
  <CompanyDecisionReadinessBoundary>{children}</CompanyDecisionReadinessBoundary>
);

export default function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<LoadingState title="Motor SRM" subtitle="Carregando o módulo solicitado." />}>
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
            <Route index element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="change-password" element={<ChangePasswordPage />} />
            <Route path="users" element={<RequireGodMode><UsersPage /></RequireGodMode>} />
            <Route path="historical-archive" element={<RequireGodMode><HistoricalArchivePage /></RequireGodMode>} />
            <Route path="search-profiles" element={<QuickSearchPage />} />
            <Route path="search-profiles/advanced" element={<SearchProfilesPage />} />
            <Route path="companies" element={portfolioGate(<CompaniesPage />)} />
            <Route path="companies/:id" element={<CompanyDecisionReadinessBoundary scope="company"><CompanyDetailKnowledgePage /></CompanyDecisionReadinessBoundary>} />
            <Route path="market-map" element={<FidcMarketMapPage />} />
            <Route path="watch-lists" element={portfolioGate(<WatchListPage />)} />
            <Route path="monitoring" element={<MonitoringPage />} />
            <Route path="capture-inbox" element={<CandidateDecisionQueuePage />} />
            <Route path="identity-review" element={<CandidateIdentityReviewPage />} />
            <Route path="credit-review" element={<RequireGodMode><CompanyCreditReviewPage /></RequireGodMode>} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="origination-os" element={<OriginationOsPage />} />
            <Route path="dcm-daily" element={<DcmDailyOutreachPage />} />
            <Route path="task-center" element={<TaskCenterWithAiPage />} />
            <Route path="knowledge-vault" element={<KnowledgeVaultPage />} />
            <Route path="knowledge-learning" element={<KnowledgeLearningAgentPage />} />
            <Route path="knowledge-search" element={<KnowledgeSearchPage />} />
            <Route path="outcome-operations" element={<OutcomeOperationsPage />} />
            <Route path="pipeline" element={portfolioGate(<PipelinePage />)} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}
