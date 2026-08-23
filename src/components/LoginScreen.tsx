import { useState } from 'react';
import { Lock } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (username: string, password: string, rememberMe: boolean) => Promise<string | null>;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (username.trim().length === 0 || password.length === 0) {
      setError('Please enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onLogin(username.trim(), password, rememberMe);
    if (result) {
      setError(result);
      setPassword('');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f4f6f8] p-4">
      <div className="w-full max-w-sm bg-white rounded-lg border border-[#e0e0e0] shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={20} className="text-[#2b579a]" />
          <h1 className="text-lg font-bold text-[#263238]">Sign in</h1>
        </div>

        <label className="block text-xs font-bold text-[#263238] mb-1">Username</label>
        <input
          type="text"
          value={username}
          autoFocus
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          className="w-full mb-3 px-3 py-2 text-sm border border-[#e0e0e0] rounded outline-none focus:border-[#2b579a]"
        />

        <label className="block text-xs font-bold text-[#263238] mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          className="w-full mb-3 px-3 py-2 text-sm border border-[#e0e0e0] rounded outline-none focus:border-[#2b579a]"
        />

        <label className="flex items-center gap-2 mb-4 text-xs font-medium text-[#263238] cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="cursor-pointer"
          />
          Remember me for 15 days
        </label>

        {error ? (
          <div className="mb-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full rounded bg-[#2b579a] text-white text-sm font-bold py-2 cursor-pointer hover:bg-[#24487f] disabled:opacity-55 disabled:cursor-not-allowed"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
