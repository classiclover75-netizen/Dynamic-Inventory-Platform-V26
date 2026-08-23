import type { ReactNode } from 'react';
import { AuthContext, useAuthSession } from '../hooks/useAuthSession';
import { LoginScreen } from './LoginScreen';
import { SetupMasterScreen } from './SetupMasterScreen';

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const session = useAuthSession();

  if (session.status === 'loading') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f4f6f8]">
        <div className="text-sm font-medium text-[#546e7a]">Loading...</div>
      </div>
    );
  }

  if (session.status === 'setup') {
    return <SetupMasterScreen onSetup={session.setupMaster} />;
  }

  if (session.status === 'login') {
    return <LoginScreen onLogin={session.login} />;
  }

  return (
    <AuthContext.Provider
      value={{
        status: session.status,
        username: session.username,
        role: session.role,
        logout: session.logout,
        refresh: session.refresh
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
