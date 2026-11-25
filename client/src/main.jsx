import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Speakers from './pages/Speakers.jsx';
import SpeakerDetail from './pages/SpeakerDetail.jsx';
import Sessions from './pages/Sessions.jsx';
import Session from './pages/Session.jsx';
import AnnotateList from './pages/AnnotateList.jsx';
import Annotate from './pages/Annotate.jsx';
import Review from './pages/Review.jsx';
import ExportPage from './pages/Export.jsx';
import Users from './pages/Users.jsx';

function Guard({ roles, children }) {
  const { user, can } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !can(...roles)) return <Navigate to="/" replace />;
  return children;
}

function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="speakers" element={<Speakers />} />
        <Route path="speakers/:id" element={<SpeakerDetail />} />
        <Route path="sessions" element={<Guard roles={['interviewer']}><Sessions /></Guard>} />
        <Route path="sessions/:id" element={<Guard roles={['interviewer']}><Session /></Guard>} />
        <Route path="annotate" element={<Guard roles={['annotator']}><AnnotateList /></Guard>} />
        <Route path="annotate/:id" element={<Guard roles={['annotator', 'reviewer']}><Annotate /></Guard>} />
        <Route path="review" element={<Guard roles={['reviewer']}><Review /></Guard>} />
        <Route path="export" element={<Guard roles={['reviewer']}><ExportPage /></Guard>} />
        <Route path="users" element={<Guard roles={[]}><Users /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>
);
