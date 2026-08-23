import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface SetupMasterScreenProps {
  onSetup: (username: string, password: string) => Promise<string | null>;
}

export function SetupMasterScreen({ onSetup }: SetupMasterScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Both passwords must match.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onSetup(username.trim(), password);
    if (result) {
      setError(result);
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f4f6f8] p-4">
      <div className="w-full max-w-sm bg-white rounded-lg border border-[#e0e0e0] shadow-sm p-6">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={20} className="text-[#2b579a]" />
          <h1 className="text-lg font-bold text-[#263238]">Create master account</h1>
        </div>
        <p className="text-xs text-[#546e7a] mb-5">
          This is the first run. The master account controls the app and can add or remove other users.
        </p>

        <label className="block text-xs font-bold text-[#263238] mb-1">Master username</label>
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

        <label className="block text-xs font-bold text-[#263238] mb-1">Confirm password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          className="w-full mb-4 px-3 py-2 text-sm border border-[#e0e0e0] rounded outline-none focus:border-[#2b579a]"
        />

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
          {busy ? 'Creating...' : 'Create master account'}
        </button>
      </div>
    </div>
  );
}
