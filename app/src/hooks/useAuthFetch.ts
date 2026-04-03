import { useAuth } from '@clerk/expo';
import { useCallback } from 'react';

export function useAuthFetch() {
  const { getToken } = useAuth();

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = await getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
  }, [getToken]);

  return authFetch;
}
