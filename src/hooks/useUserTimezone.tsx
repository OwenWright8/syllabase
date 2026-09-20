import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const DEFAULT_TIMEZONE = 'America/New_York';

export const userPreferencesKeys = {
  all: (userId: string) => ['user-preferences', userId] as const,
};

/**
 * The user's saved profile preferences: timezone, semester start, and the
 * theme settings.
 *
 * Backed by react-query so every component (and the theme provider) shares one
 * cached request instead of each firing its own, and so the value is already
 * there when a page mounts. `loading` is true only until the *first* answer:
 * pages that derive state from the timezone once (e.g. Today's initial date)
 * should wait for it rather than lock in the default. Invalidate
 * `userPreferencesKeys.all` after changing these on the Profile page.
 */
export function useUserPreferences() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: userPreferencesKeys.all(user?.id ?? ''),
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('timezone, semester_start, color_theme, theme_preference')
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
    // These change only when the user edits them on the Profile page (which
    // invalidates this query). Without a stale time every component that mounts
    // after the first response would refetch, defeating the shared cache.
    staleTime: 5 * 60 * 1000,
  });

  return {
    timezone: data?.timezone || DEFAULT_TIMEZONE,
    semesterStart: data?.semester_start ?? null,
    colorTheme: data?.color_theme ?? null,
    themePreference: data?.theme_preference ?? null,
    loading: !!user && isLoading,
  };
}

/** Just the timezone and semester start, for the many callers that need nothing else. */
export function useUserTimezone() {
  const { timezone, semesterStart, loading } = useUserPreferences();
  return { timezone, semesterStart, loading };
}
