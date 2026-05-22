import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StoreInitializer } from './components/StoreInitializer';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { Layout } from './components/layout/Layout';
import { Loader2 } from 'lucide-react';

// Critical path — loaded synchronously (no auth required, tiny)
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';

// Lazy — only loaded when the route is first visited
const Dashboard            = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Pipeline             = lazy(() => import('./pages/Pipeline').then(m => ({ default: m.Pipeline })));
const Proposals            = lazy(() => import('./pages/Proposals').then(m => ({ default: m.Proposals })));
const ProposalWorkspace    = lazy(() => import('./pages/ProposalWorkspace').then(m => ({ default: m.ProposalWorkspace })));
const Templates            = lazy(() => import('./pages/Templates').then(m => ({ default: m.Templates })));
const TemplateWorkspace    = lazy(() => import('./pages/TemplateWorkspace').then(m => ({ default: m.TemplateWorkspace })));
const Catalog              = lazy(() => import('./pages/Catalog').then(m => ({ default: m.Catalog })));
const RateCards            = lazy(() => import('./pages/RateCards').then(m => ({ default: m.RateCards })));
const Settings             = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const UserManagement       = lazy(() => import('./pages/UserManagement').then(m => ({ default: m.UserManagement })));
const Clauses              = lazy(() => import('./pages/Clauses').then(m => ({ default: m.Clauses })));
const Help                 = lazy(() => import('./pages/Help').then(m => ({ default: m.Help })));
const Profile              = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const SharedProposalView   = lazy(() => import('./pages/SharedProposalView').then(m => ({ default: m.SharedProposalView })));
const CustomerProposalView = lazy(() => import('./pages/CustomerProposalView').then(m => ({ default: m.CustomerProposalView })));

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-brand-950 flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-brand-300" />
    </div>
  );
}

function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <Loader2 size={24} className="animate-spin text-gray-400" />
    </div>
  );
}

function AppRoutes() {
  const { currentUser, authLoading } = useAuth();

  return (
    <Routes>
      <Route path="/login"           element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password"  element={<ResetPassword />} />
      <Route path="/share/:token"    element={<Suspense fallback={<LoadingScreen />}><SharedProposalView /></Suspense>} />
      <Route path="/customer/:token" element={<Suspense fallback={<LoadingScreen />}><CustomerProposalView /></Suspense>} />
      <Route
        element={
          authLoading
            ? <LoadingScreen />
            : !currentUser
              ? <Navigate to="/login" replace />
              : <Layout />
        }
      >
        <Route path="/"              element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
        <Route path="/pipeline"      element={<Suspense fallback={<PageFallback />}><Pipeline /></Suspense>} />
        <Route path="/proposals"     element={<Suspense fallback={<PageFallback />}><Proposals /></Suspense>} />
        <Route path="/proposals/new" element={<Navigate to="/proposals" replace />} />
        <Route path="/proposals/:id" element={<Suspense fallback={<PageFallback />}><ProposalWorkspace /></Suspense>} />
        <Route path="/templates"     element={<Suspense fallback={<PageFallback />}><Templates /></Suspense>} />
        <Route path="/templates/:id" element={<Suspense fallback={<PageFallback />}><TemplateWorkspace /></Suspense>} />
        <Route path="/catalog"       element={<Suspense fallback={<PageFallback />}><Catalog /></Suspense>} />
        <Route path="/rate-cards"    element={<Suspense fallback={<PageFallback />}><RateCards /></Suspense>} />
        <Route path="/users"         element={<Suspense fallback={<PageFallback />}><UserManagement /></Suspense>} />
        <Route path="/clauses"       element={<Suspense fallback={<PageFallback />}><Clauses /></Suspense>} />
        <Route path="/help"          element={<Suspense fallback={<PageFallback />}><Help /></Suspense>} />
        <Route path="/settings"      element={<Suspense fallback={<PageFallback />}><Settings /></Suspense>} />
        <Route path="/profile"       element={<Suspense fallback={<PageFallback />}><Profile /></Suspense>} />
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
