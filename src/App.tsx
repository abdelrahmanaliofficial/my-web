import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LanguageProvider } from './i18n/LanguageContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { AuthProvider } from './contexts/AuthContext';
import { ProjectsProvider } from './contexts/ProjectsContext';
import { BillingProvider } from './contexts/BillingContext';
import { ChatProvider } from './contexts/ChatContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LoginModal from './components/auth/LoginModal';
import ProtectedRoute from './components/auth/ProtectedRoute';
import HomePage from './pages/HomePage';
import PortfolioPage from './pages/PortfolioPage';
import ContactPage from './pages/ContactPage';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import DashboardPage from './pages/dashboard/DashboardPage';
import BookingsPage from './pages/dashboard/BookingsPage';
import TeamSettingsTab from './pages/dashboard/TeamSettingsTab';
import Settings from './pages/dashboard/Settings';
import ProfileTab from './pages/dashboard/ProfileTab';
import ClientsPage from './pages/dashboard/ClientsPage';
import ProjectsPage from './pages/dashboard/ProjectsPage';
import BillingDashboard from './pages/dashboard/BillingDashboard';
import Messages from './pages/dashboard/Messages';
import ClientPortalPage from './pages/dashboard/ClientPortalPage';
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import NotFound from './pages/NotFound';

export function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ProjectsProvider>
          <BillingProvider>
          <ChatProvider>
          <SettingsProvider>
          <BrowserRouter>
            <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
              <Navbar />
              <div className="flex-1">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/portfolio" element={<PortfolioPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />

                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute
                        allowedRoles={['super_admin', 'custom_admin']}
                        requiredPermissions={['view_stats', 'manage_stats']}
                      >
                        <DashboardLayout>
                          <DashboardPage />
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard/bookings"
                    element={
                      <ProtectedRoute
                        allowedRoles={['super_admin', 'custom_admin']}
                        requiredPermissions={['view_leads', 'manage_leads']}
                      >
                        <DashboardLayout>
                          <BookingsPage />
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard/clients"
                    element={
                      <ProtectedRoute
                        allowedRoles={['super_admin', 'custom_admin']}
                        requiredPermissions={['view_clients', 'manage_clients']}
                      >
                        <DashboardLayout>
                          <ClientsPage />
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard/projects"
                    element={
                      <ProtectedRoute
                        allowedRoles={['super_admin', 'custom_admin']}
                        requiredPermissions={['view_projects', 'manage_projects']}
                      >
                        <DashboardLayout>
                          <ProjectsPage />
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard/billing"
                    element={
                      <ProtectedRoute
                        allowedRoles={['super_admin', 'custom_admin']}
                        requiredPermissions={['view_billing', 'manage_billing']}
                      >
                        <DashboardLayout>
                          <BillingDashboard />
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard/messages"
                    element={
                      <ProtectedRoute
                        allowedRoles={['super_admin', 'custom_admin']}
                        requiredPermissions={['view_messages', 'manage_messages']}
                      >
                        <DashboardLayout>
                          <Messages />
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard/team"
                    element={
                      <ProtectedRoute
                        allowedRoles={['super_admin', 'custom_admin']}
                        requiredPermissions={['view_team', 'create_team', 'update_team', 'manage_team']}
                      >
                        <DashboardLayout>
                          <TeamSettingsTab />
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard/settings"
                    element={
                      <ProtectedRoute
                        allowedRoles={['super_admin', 'custom_admin']}
                        requiredPermissions={['view_settings', 'manage_settings']}
                      >
                        <DashboardLayout>
                          <Settings />
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard/profile"
                    element={
                      <ProtectedRoute allowedRoles={['super_admin', 'custom_admin', 'client']}>
                        <DashboardLayout>
                          <ProfileTab />
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/client"
                    element={
                      <ProtectedRoute allowedRoles={['client']}>
                        <DashboardLayout>
                          <ClientPortalPage />
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </div>
              <Footer />
              <LoginModal />
              <Toaster position="bottom-center" />
            </div>
          </BrowserRouter>
          </SettingsProvider>
          </ChatProvider>
          </BillingProvider>
        </ProjectsProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
