import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.detail || 'Failed to login. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden scanline">
      {/* Background Decor */}
      <div className="absolute top-10 left-10 structural-text">01</div>
      
      <div className="bg-white/5 backdrop-blur-2xl border border-white/5 rounded-lg shadow-xl p-8 w-full max-w-[380px] relative z-10 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 mb-2">
          <img src="/logo.png" alt="Lurien Matrix Logo" className="w-24 h-24 object-contain opacity-90 drop-shadow-[0_0_15px_rgba(212,184,158,0.3)]" />
          <h1 className="title-text font-light tracking-widest text-luma-FFF uppercase mt-2">Lurien <span className="font-bold text-accent-gold">Matrix</span></h1>
        </div>

        {error && (
          <div className="p-3 border border-firewall-red/50 bg-firewall-red/10 text-firewall-red text-sm font-mono rounded-md">
            [ERROR] {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-luma-500 font-bold">Identity (Email)</label>
            <input
              type="email"
              required
              className="w-full bg-black/20 border border-white/10 rounded-md px-4 py-3 text-sm font-mono text-luma-FFF placeholder-luma-700 focus:outline-none focus:border-luma-500 uppercase transition-colors"
              placeholder="operator@system.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-luma-500 font-bold">Passcode</label>
            <input
              type="password"
              required
              className="w-full bg-black/20 border border-white/10 rounded-md px-4 py-3 text-sm font-mono text-luma-FFF placeholder-luma-700 focus:outline-none focus:border-luma-500 tracking-widest transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full py-4 bg-accent-gold text-luma-000 border border-accent-gold rounded-md shadow-[0_0_20px_rgba(212,184,158,0.2)] text-sm font-bold uppercase tracking-widest hover:bg-accent-gold/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'INITIALIZE SESSION'}
          </button>
        </form>

        <div className="text-center mt-4 border-t border-white/5 pt-6">
          <p className="text-luma-500 text-xs font-mono uppercase tracking-widest">
            NO CLEARANCE? <Link to="/signup" className="text-accent-gold hover:text-accent-gold/80 transition-colors ml-2 font-bold pb-1 border-b border-transparent hover:border-accent-gold/50">REQUEST ACCESS</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
