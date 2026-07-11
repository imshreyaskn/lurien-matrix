import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import LiveMonitor from './pages/LiveMonitor'
import Analytics from './pages/Analytics'
import ApiKeys from './pages/ApiKeys'
import Logs from './pages/Logs'
import ThreatGraph from './pages/ThreatGraph'
import NotFound from './pages/NotFound'
import Login from './pages/Login'
import Signup from './pages/Signup'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null; // Or a loading spinner
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      
      <Route element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route path="/" element={<Overview />} />
        <Route path="/monitor" element={<LiveMonitor />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/keys" element={<ApiKeys />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/graph" element={<ThreatGraph />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
