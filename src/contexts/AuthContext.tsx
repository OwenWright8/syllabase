import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signIn: (username: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (username: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

// Self-hosted accounts are username/password, not email — but GoTrue is
// still email-shaped under the hood, so a username is mapped to a fixed
// pseudo-domain before ever talking to Supabase auth. The Auth page
// decides whether to show sign-in or first-run sign-up based on whether
// any account exists yet (see the instance-status function).
const ACCOUNT_EMAIL_DOMAIN = "accounts.local";

function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${ACCOUNT_EMAIL_DOMAIN}`;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    return { error };
  };

  const signUp = async (username: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: {
        data: { username: username.trim().toLowerCase() },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, signIn, signUp, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
