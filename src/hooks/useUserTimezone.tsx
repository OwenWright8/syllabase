import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface UserPreferences {
  timezone: string;
  semesterStart: string | null;
}

export function useUserTimezone() {
  const { user } = useAuth();
  const [timezone, setTimezone] = useState<string>('America/New_York');
  const [semesterStart, setSemesterStart] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchPreferences = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('timezone, semester_start')
          .eq('id', user.id)
          .single();

        if (!error && data) {
          if (data.timezone) setTimezone(data.timezone);
          if (data.semester_start) setSemesterStart(data.semester_start);
        }
      } catch (error) {
        console.error('Error fetching user preferences:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPreferences();
  }, [user]);

  return { timezone, semesterStart, loading };
}
