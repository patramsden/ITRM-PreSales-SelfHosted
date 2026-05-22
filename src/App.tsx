import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StoreInitializer } from './components/StoreInitializer';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Pipeline } from './pages/Pipeline';
import { Proposals } from './pages/Proposals';
import { ProposalWorkspace } from './pages/ProposalWorkspace';
import { Templates } from './pages/Templates';
import { TemplateWorkspace } from './pages/TemplateWorkspace';
import { Catalog } from './pages/Catalog';
import { RateCards } from './pages/RateCards';
import { Settings } from './pages/Settings';
import { UserManagement } from './pages/UserManagement';
import { SharedProposalView } from './pages/SharedProposalView';
import { CustomerProposalView } from './pages/CustomerProposalView';
import { ForgotPassword } from './pages/ForgotPassword';
import { Clauses } from './pages/Clauses';
import { Help } from './pages/Help';
import { ResetPassword } from './pages/ResetPassword';
import { Profile } from './pages/Profile';
import { Loader2 } from 'lucide-react';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-brand-950 flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-brand-300" />
    </div>
  );
}

function AppRoutes() {
  const { currentUser, authLoading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/share/:token" element={<SharedProposalView />} />
      <Route path="/customer/:token" element={<CustomerProposalView />} />
      <Route
        element={
          authLoading
            ? <LoadingScreen />
            : !currentUser
              ? <Navigate to="/login" replace />
              : <Layout />
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/proposals" element={<Proposals />} />
        <Route path="/proposals/new" element={<Navigate to="/proposals" replace />} />
        <Route path="/proposals/:id" element={<ProposalWorkspace />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/:id" element={<TemplateWorkspace />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/rate-cards" element={<RateCards />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/clauses" element={<Clauses />} />
        <Route path="/help" element={<Help />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrandingProvider>
          <AuthProvider>
            <BrowserRouter>
              <StoreInitializer>
                <AppRoutes />
                <UpdateBanner />
              </StoreInitializer>
            </BrowserRouter>
          </AuthProvider>
        </BrandingProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
