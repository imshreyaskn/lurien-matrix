import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      return setError('Passcodes do not match.');
    }
    if (password.length < 6) {
      return setError('Passcode must be at least 6 characters.');
    }

    setLoading(true);
    
    try {
      await signup(email, password);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(err.detail || err.error || "Failed to request access. Identity may already exist.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden scanline">
      {/* Background Decor */}
      <div className="absolute bottom-10 right-10 structural-text">02</div>
      
      <div className="auth-card p-10 w-full max-w-md relative z-10 flex flex-col gap-8">
        <div className="flex flex-col items-center gap-4 mb-2">
          <img src="/logo.png" alt="Lurien Matrix Logo" className="w-24 h-24 object-contain opacity-90" />
          <h1 className="title-text font-light tracking-widest text-luma-FFF uppercase mt-2">Lurien Matrix</h1>
        </div>

        {error && (
          <div className="p-3 border border-firewall-red bg-firewall-red/10 text-firewall-red text-sm font-mono animate-blocked-shake">
            [ERROR] {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-luma-500">Identity (Email)</label>
            <input
              type="email"
              required
              className="bg-black/40 border border-luma-300 p-3 text-luma-FFF focus:outline-none focus:border-luma-700 transition-colors rounded-md"
              placeholder="operator@system.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-luma-500">Passcode</label>
            <input
              type="password"
              required
              className="bg-luma-50 border border-luma-300 p-3 text-luma-FFF focus:outline-none focus:border-luma-700 transition-colors rounded-md font-mono tracking-widest"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-luma-500">Confirm Passcode</label>
            <input
              type="password"
              required
              className="bg-luma-50 border border-luma-300 p-3 text-luma-FFF focus:outline-none focus:border-luma-700 transition-colors rounded-md font-mono tracking-widest"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 inverted-chip w-full py-4 flex items-center justify-center gap-2 hover:bg-luma-900 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'GENERATE CREDENTIALS'}
          </button>
        </form>

        <div className="text-center mt-2">
          <p className="text-luma-500 text-xs">
            ALREADY CLEARED? <Link to="/login" className="text-luma-FFF border-b border-luma-300 hover:border-luma-FFF transition-colors pb-1 ml-2">AUTHENTICATE</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
