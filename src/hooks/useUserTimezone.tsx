import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const DEFAULT_TIMEZONE = 'America/New_York';

export const userPreferencesKeys = {
  all: (userId: string) => ['user-preferences', userId] as const,
};

/**
 * The user's timezone and semester start, read from their profile.
 *
 * Backed by react-query so every component shares one cached request instead
 * of each firing its own, and so the value is already there when a page
 * mounts. `loading` is true only until the *first* answer: pages that derive
 * state from the timezone once (e.g. Today's initial date) should wait for it
 * rather than lock in the default. Invalidate `userPreferencesKeys.all` after
 * changing these on the Profile page.
 */
export function useUserTimezone() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: userPreferencesKeys.all(user?.id ?? ''),
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('timezone, semester_start')
          .eq('id', user!.id)
          .single();
        if (error) throw error;
        return data;
      } catch (error) {
        // Fall back to the defaults rather than blocking the app on this.
        console.error('Error fetching user preferences:', error);
        return null;
      }
    },
    enabled: !!user,
  });

  return {
    timezone: data?.timezone || DEFAULT_TIMEZONE,
    semesterStart: data?.semester_start ?? null,
    loading: !!user && isLoading,
  };
}
