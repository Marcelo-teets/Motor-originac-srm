import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { SourcesPage } from './pages/SourcesPage'
import { CompaniesPage } from './pages/CompaniesPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
      </Routes>
    </Layout>
  )
}
