import * as SecureStore from 'expo-secure-store';
import { useState, useEffect } from 'react';

const LBS_TO_KG = 0.4536;
const KG_TO_LBS = 2.2046;

/** Convert stored lbs to display value */
export function displayWeight(lbs: number, useKg: boolean): number {
  if (!lbs) return 0;
  return useKg ? Math.round(lbs * LBS_TO_KG * 10) / 10 : lbs;
}

/** Convert user input to lbs for storage */
export function toLbs(value: number, useKg: boolean): number {
  return useKg ? Math.round(value * KG_TO_LBS * 10) / 10 : value;
}

/** Unit label string */
export function unitLabel(useKg: boolean): string {
  return useKg ? 'kg' : 'lbs';
}

/** Hook to read unit preference from SecureStore */
export function useUnits(): boolean {
  const [useKg, setUseKg] = useState(false);
  useEffect(() => {
    SecureStore.getItemAsync('units_kg').then(v => {
      if (v === 'true') setUseKg(true);
    });
  }, []);
  return useKg;
}
