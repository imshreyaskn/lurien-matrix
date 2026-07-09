import { NavLink } from 'react-router-dom';
import { Shield, Activity, BarChart3, Key, FileText, Power } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', icon: Shield, label: 'Overview' },
  { to: '/monitor', icon: Activity, label: 'Live' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/keys', icon: Key, label: 'Keys' },
  { to: '/logs', icon: FileText, label: 'Logs' },
];

export default function FloatingIsland() {
  const { data: healthData, error } = usePolling(() => api.health(), 10000);
  const { logout } = useAuth();
  
  return (
    <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center p-2 bg-luma-100/50 backdrop-blur-2xl border border-white/10 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] transition-transform duration-500 hover:scale-[1.02]">
      {/* Brand / Status */}
      <div className="flex items-center gap-3 pl-4 pr-6 border-r border-white/10">
        <div className="w-8 h-8 flex items-center justify-center">
          <img src="/logo.png" alt="Lurien" className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
        </div>
        <div className={`w-2 h-2 rounded-xl shadow-[0_0_10px_currentColor] ${error ? 'bg-status-offline text-status-offline' : 'bg-status-online text-status-online'}`} title={error ? 'System Offline' : 'System Online'} />
      </div>

      {/* Nav Items */}
      <div className="flex items-center px-4 gap-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative group flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] ${
                isActive
                  ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                  : 'text-luma-500 hover:text-white hover:bg-white/5'
              }`
            }
            title={label}
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} strokeWidth={isActive ? 2 : 1.5} />
                {isActive && (
                  <div className="absolute -bottom-2 w-1 h-1 bg-white rounded-xl shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center pl-6 pr-2 border-l border-white/10">
        <button
          onClick={logout}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-luma-500 hover:text-firewall-red hover:bg-firewall-red/10 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
          title="Terminate Session"
        >
          <Power className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
