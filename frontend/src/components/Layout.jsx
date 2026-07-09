import { Outlet } from 'react-router-dom';
import FloatingIsland from './FloatingIsland';

export default function Layout() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-luma-000">
      {/* Structural Watermark */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="structural-text absolute -left-40 top-40 -rotate-90 origin-left">
          LURIEN
        </div>
        <div className="structural-text absolute right-[-100px] bottom-[-40px] opacity-20 text-[250px]">
          SYSTEM
        </div>
      </div>

      <FloatingIsland />
      
      {/* Edge-to-Edge Content Canvas */}
      <main className="absolute inset-0 z-10 scanline overflow-y-auto">
        <div className="min-h-full px-4 md:px-12 pt-8 pb-32 max-w-[2000px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
