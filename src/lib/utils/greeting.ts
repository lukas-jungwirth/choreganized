export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/**
 * Which "Good …" Home says at a household-local hour. Morning starts at 05:00,
 * when the raccoon wakes up (→ `utils/raccoon.ts`), not at midnight: someone
 * still up at one in the morning is having a late evening (→ DECISIONS #296).
 */
export function greetingFor(hour: number): TimeOfDay {
	if (hour < 5) return 'evening';
	if (hour < 12) return 'morning';
	if (hour < 18) return 'afternoon';
	return 'evening';
}
