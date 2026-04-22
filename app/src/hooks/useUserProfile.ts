import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/expo';
import { API_BASE } from '../config';
import { useAuthFetch } from './useAuthFetch';

export type UserProfile = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  dob: string | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  health_connected_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type UserProfilePatch = Partial<{
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  dob: string | null;
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
}>;

// Keeps the backend `user_profile` row in sync with the current Clerk user.
// Call once at app root (App.tsx) so first login / re-auth always populates
// the row. Returns helpers for patching the profile and stamping the
// Apple Health connection timestamp.
export function useUserProfile(): {
  profile: UserProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  patch: (p: UserProfilePatch) => Promise<void>;
  markHealthConnected: (connected: boolean) => Promise<void>;
} {
  const { user, isSignedIn, isLoaded } = useUser();
  const authFetch = useAuthFetch();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const res = await authFetch(`${API_BASE}/api/user/profile`);
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data);
    } catch { /* silent */ }
  }, [authFetch, isSignedIn]);

  const patch = useCallback(async (p: UserProfilePatch) => {
    if (!isSignedIn) return;
    try {
      const res = await authFetch(`${API_BASE}/api/user/profile`, {
        method: 'POST',
        body: JSON.stringify(p),
      });
      if (res.ok) setProfile(await res.json());
    } catch { /* silent */ }
  }, [authFetch, isSignedIn]);

  const markHealthConnected = useCallback(async (connected: boolean) => {
    if (!isSignedIn) return;
    try {
      await authFetch(`${API_BASE}/api/user/profile/health-connected`, {
        method: 'POST',
        body: JSON.stringify({ connected }),
      });
      // Re-read so any timestamp lands in state immediately.
      refresh();
    } catch { /* silent */ }
  }, [authFetch, isSignedIn, refresh]);

  // On first mount (and whenever the signed-in user changes), upsert the
  // Clerk details into our backend so name/email/avatar are always up-to-date.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    setLoading(true);
    const clerkPatch: UserProfilePatch = {
      email: user.primaryEmailAddress?.emailAddress ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      avatarUrl: user.imageUrl ?? null,
    };
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/user/profile`, {
          method: 'POST',
          body: JSON.stringify(clerkPatch),
        });
        if (res.ok) setProfile(await res.json());
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [isLoaded, isSignedIn, user?.id, authFetch]);

  return { profile, loading, refresh, patch, markHealthConnected };
}
