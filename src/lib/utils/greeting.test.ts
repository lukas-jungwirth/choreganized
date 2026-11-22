import { describe, expect, it } from 'vitest';
import { greetingFor } from './greeting';

describe('greetingFor', () => {
	it('keeps saying good evening after midnight, until 05:00', () => {
		for (const hour of [0, 1, 2, 3, 4]) expect(greetingFor(hour)).toBe('evening');
	});

	it('says good morning from 05:00 until noon', () => {
		expect(greetingFor(5)).toBe('morning');
		expect(greetingFor(11)).toBe('morning');
	});

	it('says good afternoon from noon, good evening from 18:00', () => {
		expect(greetingFor(12)).toBe('afternoon');
		expect(greetingFor(17)).toBe('afternoon');
		expect(greetingFor(18)).toBe('evening');
		expect(greetingFor(23)).toBe('evening');
	});
});
