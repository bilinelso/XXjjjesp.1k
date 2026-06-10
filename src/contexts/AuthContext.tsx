import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  nome?: string;
  created_at: string;
  updated_at?: string;
  is_master: boolean;
  can_access_leads: boolean;
  can_access_dashboard: boolean;
  can_access_kanban: boolean;
  can_access_agendamentos: boolean;
  can_access_config: boolean;
  can_access_formularios: boolean;
  can_access_whatsapp: boolean;
  can_access_campanhas: boolean;
  can_access_financeiro: boolean;
  can_access_passwords: boolean;
  assessor_id?: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  canAccess: (view: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) {
          setUser(session.user);
          await loadProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
      })();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await loadProfile(session.user.id);
      }
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
      setProfile(null);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        setUser(data.user);
        await loadProfile(data.user.id);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erro ao fazer login' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const canAccess = (view: string): boolean => {
    if (!profile) return false;
    if (profile.is_master) return true;

    const viewMap: Record<string, keyof UserProfile> = {
      leads: 'can_access_leads',
      dashboard: 'can_access_dashboard',
      kanban: 'can_access_kanban',
      agendamentos: 'can_access_agendamentos',
      configuracoes: 'can_access_config',
      formularios: 'can_access_formularios',
      whatsapp: 'can_access_whatsapp',
      campanhas: 'can_access_campanhas',
      financeiro: 'can_access_financeiro',
    };

    const permission = viewMap[view];
    return permission ? profile[permission] === true : false;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, canAccess }}>
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
