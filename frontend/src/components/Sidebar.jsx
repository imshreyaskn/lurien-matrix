import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { Shield, Activity, BarChart3, Key, FileText, LogOut } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', icon: Shield, label: 'OVERVIEW' },
  { to: '/monitor', icon: Activity, label: 'LIVE MONITOR' },
  { to: '/analytics', icon: BarChart3, label: 'ANALYTICS' },
  { to: '/keys', icon: Key, label: 'API KEYS' },
  { to: '/logs', icon: FileText, label: 'LOGS' },
];

export default function Sidebar() {
  const { data: healthData, error } = usePolling(() => api.health(), 10000);
  const { user, logout } = useAuth();
  
  const activeLayers = healthData?.active_layers || 6;
  const sessionId = useMemo(() => Math.random().toString(36).substring(2, 10).toUpperCase(), []);

  return (
    <aside className="hidden md:flex w-64 h-screen bg-luma-000 border-r border-luma-300 flex-col shrink-0 font-mono z-50">
      {/* Logo */}
      <div className="p-6 border-b border-luma-300">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center">
            <img src="/logo.png" alt="Lurien Logo" className="w-full h-full object-contain" />
          </div>
          <div className="ml-3 text-left">
            <h1 className="text-xl font-bold text-luma-FFF tracking-[0.2em] uppercase">Lurien</h1>
            <p className="text-xs text-luma-500 font-sans tracking-widest uppercase">Matrix Core v1.0</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 text-sm font-bold tracking-widest transition-all duration-0 ${
                isActive
                  ? 'bg-luma-100 text-luma-FFF border-l border-luma-FFF'
                  : 'text-luma-500 hover:text-luma-FFF border-l border-transparent hover:border-luma-700 hover:bg-luma-100/50'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="w-4 h-4" strokeWidth={isActive ? 2 : 1} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Status */}
      <div className="p-4 border-t border-luma-300">
        <div className="border border-luma-300 bg-luma-000 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-luma-500 uppercase tracking-widest">Sys_Status</span>
            <div className={`w-2 h-2 ${error ? 'bg-status-offline' : 'bg-status-online'}`} />
          </div>
          <div className={`text-xs uppercase tracking-widest ${error ? 'text-status-offline' : 'text-accent-gold'}`}>
            {error ? 'OFFLINE / ERROR' : `ACTIVE / ${activeLayers}-LAYER`}
          </div>
          <div className="text-[10px] text-luma-500 font-mono tracking-widest uppercase break-all">
            ID: {sessionId}
          </div>
        </div>
      </div>
      
      {/* User Actions */}
      <div className="p-4 border-t border-luma-300">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-luma-500 uppercase tracking-widest truncate">
            {user?.email || 'Unknown User'}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs text-luma-500 hover:text-firewall-red transition-colors uppercase tracking-widest font-bold"
          >
            <LogOut className="w-4 h-4" />
            Terminate Session
          </button>
        </div>
      </div>
    </aside>
  );
}
