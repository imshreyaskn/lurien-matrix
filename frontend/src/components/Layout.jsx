import { Outlet } from 'react-router-dom';
import FloatingIsland from './FloatingIsland';

export default function Layout() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-luma-000/30 backdrop-blur-[80px]">
      {/* Noise Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.06] z-0" 
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'2.5\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}
      ></div>
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
      <main className="absolute inset-0 z-10 overflow-y-auto">
        <div className="min-h-full px-4 md:px-12 pt-8 pb-32 max-w-[2000px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
