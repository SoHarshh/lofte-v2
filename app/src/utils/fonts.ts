// Typography system
// - Fraunces (serif) → titles and headlines only
// - Inter (sans-serif) → numbers, body copy, labels, buttons
// - Georgia → reserved for the "LOFTE" brand wordmark (handled inline)
//
// Import the appropriate constant based on usage. If unsure, use FONT_REGULAR
// for body and HEADING_SEMIBOLD for titles.

// ── Numbers & body (Inter, sans-serif) ─────────────────────────────────────
export const FONT_LIGHT = 'Inter_300Light';
export const FONT_REGULAR = 'Inter_400Regular';
export const FONT_MEDIUM = 'Inter_500Medium';
export const FONT_SEMIBOLD = 'Inter_600SemiBold';
export const FONT_BOLD = 'Inter_700Bold';

// ── Titles & headlines (Fraunces, serif) ───────────────────────────────────
export const HEADING_LIGHT = 'Fraunces_300Light';
export const HEADING_REGULAR = 'Fraunces_400Regular';
export const HEADING_MEDIUM = 'Fraunces_500Medium';
export const HEADING_SEMIBOLD = 'Fraunces_600SemiBold';
export const HEADING_BOLD = 'Fraunces_700Bold';

// Default fallback for `fontFamily: SYSTEM` usage — assumes heading context.
export const SYSTEM = HEADING_SEMIBOLD;
