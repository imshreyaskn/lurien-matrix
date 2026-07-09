import { Outlet, NavLink } from 'react-router-dom';
import { Shield, Activity, BarChart3, Key, FileText } from 'lucide-react';
import Sidebar from './Sidebar';

const mobileNavItems = [
  { to: '/', icon: Shield, label: 'OVERVIEW' },
  { to: '/monitor', icon: Activity, label: 'LIVE' },
  { to: '/analytics', icon: BarChart3, label: 'ANALYTICS' },
  { to: '/keys', icon: Key, label: 'KEYS' },
  { to: '/logs', icon: FileText, label: 'LOGS' },
];

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-luma-000 relative">
      {/* Structural Watermark */}
      <div className="absolute top-0 left-0 md:left-64 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="structural-text absolute -left-40 top-40 -rotate-90 origin-left">
          LURIEN
        </div>
        <div className="structural-text absolute right-[-100px] bottom-[-40px] opacity-20 text-[250px]">
          SYSTEM
        </div>
      </div>

      <Sidebar />
      
      <main className="flex-1 overflow-y-auto relative z-10 scanline pb-16 md:pb-0">
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto min-h-full">
          <Outlet />
        </div>
      </main>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-luma-000 border-t border-luma-300 z-50 flex">
        {mobileNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-bold tracking-widest transition-all ${
                isActive
                  ? 'bg-luma-100 text-luma-FFF border-t-2 border-luma-FFF -mt-[2px]'
                  : 'text-luma-500 hover:text-luma-FFF border-t-2 border-transparent -mt-[2px]'
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
    </div>
  );
}
