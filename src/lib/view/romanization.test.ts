/**
 * Tests for the romanization view model (H0306).
 *
 * Romanization inheritance is the heart of C-16: an allophone with no
 * explicit `roman` inherits the parent root's romanization *exactly*
 * (preserving case). The view layer MUST distinguish three states:
 *
 *   - `explicit` — the allophone has its own roman text.
 *   - `inherited` — the allophone omits `roman`; the parent's value
 *     applies.
 *   - `absent` — reserved for languages with romanization disabled
 *     entirely (not used in v0.1.0 but kept for forward compat).
 */

import { describe, expect, it } from 'vitest';
import { classifyAllophoneRoman, displayAllophoneRoman } from './romanization';

describe('classifyAllophoneRoman', () => {
	it('classifies null as inherited', () => {
		expect(classifyAllophoneRoman(null)).toEqual({ kind: 'inherited' });
	});

	it('classifies an empty string as absent', () => {
		expect(classifyAllophoneRoman('')).toEqual({ kind: 'absent' });
	});

	it('classifies a non-empty string as explicit', () => {
		expect(classifyAllophoneRoman('th')).toEqual({ kind: 'explicit', text: 'th' });
	});

	it('preserves case in explicit romanizations (C-16)', () => {
		expect(classifyAllophoneRoman('TH')).toEqual({ kind: 'explicit', text: 'TH' });
		expect(classifyAllophoneRoman('Th')).toEqual({ kind: 'explicit', text: 'Th' });
	});
});

describe('displayAllophoneRoman', () => {
	it('returns the explicit text for an explicit romanization', () => {
		expect(displayAllophoneRoman({ kind: 'explicit', text: 'th' }, 'T')).toBe('th');
	});

	it('returns the parent romanization for an inherited romanization', () => {
		expect(displayAllophoneRoman({ kind: 'inherited' }, 'T')).toBe('T');
	});

	it('preserves the parent case when inheriting', () => {
		// Parent has explicit "TH" — the allophone that omits `roman`
		// inherits the parent's exact case, not a lowercase normal form.
		expect(displayAllophoneRoman({ kind: 'inherited' }, 'TH')).toBe('TH');
	});

	it('renders an em-dash for an absent romanization', () => {
		expect(displayAllophoneRoman({ kind: 'absent' }, 'T')).toBe('—');
	});
});
