/**
 * Tests for the pure presentation helpers (H0402–H0405).
 *
 * The format module is the only place that owns display strings;
 * the Svelte components bind to its results. Tests pin every
 * label function and every IPA-preservation rule.
 */

import { describe, expect, it } from 'vitest';
import {
	CANCEL_LABEL,
	NO_ALLOPHONES_PLACEHOLDER,
	NO_DESCRIPTION_PLACEHOLDER,
	NO_PHONEMES_PLACEHOLDER,
	NO_ROOTS_PLACEHOLDER,
	REPLACE_FILE_LABEL,
	RESERVED_GROUP_LABELS,
	UPLOAD_DROP_ZONE_LABEL,
	UPLOAD_PICKER_LABEL,
	formatBytes,
	labelForAllophoneRoman,
	labelForCustomGroup,
	labelForGroupKind,
	summarizeInventory
} from './format';

describe('format / RESERVED_GROUP_LABELS', () => {
	it('exposes canonical "Consonants" and "Vowels"', () => {
		expect(RESERVED_GROUP_LABELS.consonants).toBe('Consonants');
		expect(RESERVED_GROUP_LABELS.vowels).toBe('Vowels');
	});

	it('is frozen', () => {
		expect(Object.isFrozen(RESERVED_GROUP_LABELS)).toBe(true);
	});
});

describe('format / labelForCustomGroup', () => {
	it('title-cases a single-word slug', () => {
		expect(labelForCustomGroup('clicks')).toBe('Clicks');
	});

	it('replaces dashes with spaces and title-cases each piece', () => {
		expect(labelForCustomGroup('long-vowels')).toBe('Long Vowels');
	});

	it('handles three+ segments', () => {
		expect(labelForCustomGroup('long-vowel-clicks')).toBe('Long Vowel Clicks');
	});

	it('preserves ASCII case (no Unicode transform)', () => {
		expect(labelForCustomGroup('a-b-c')).toBe('A B C');
	});

	it('returns empty pieces for leading/trailing/double dashes (defensive)', () => {
		// The SDK validates slug shape upstream; this test pins
		// the formatter's defensive behaviour for malformed
		// inputs that the controller may still see (e.g. a future
		// SDK release). The `piece.length === 0` ternary inside
		// `.map` is the branch being exercised.
		expect(labelForCustomGroup('-leading')).toBe(' Leading');
		expect(labelForCustomGroup('trailing-')).toBe('Trailing ');
		expect(labelForCustomGroup('double--dash')).toBe('Double  Dash');
	});
});

describe('format / labelForGroupKind', () => {
	it('maps "consonants" to the canonical plural', () => {
		expect(labelForGroupKind('consonants')).toBe('Consonants');
	});

	it('maps "vowels" to the canonical plural', () => {
		expect(labelForGroupKind('vowels')).toBe('Vowels');
	});

	it('maps a custom kind to the title-cased name', () => {
		expect(labelForGroupKind({ name: 'clicks' })).toBe('Clicks');
		expect(labelForGroupKind({ name: 'long-vowels' })).toBe('Long Vowels');
	});
});

describe('format / labelForAllophoneRoman', () => {
	it('labels an explicit romanization', () => {
		expect(labelForAllophoneRoman({ kind: 'explicit', text: 'pʰ' })).toBe('explicit');
	});

	it('labels an inherited romanization (C-16)', () => {
		expect(labelForAllophoneRoman({ kind: 'inherited' })).toMatch(/inherited/i);
	});

	it('labels an absent romanization (reserved for forward compat)', () => {
		expect(labelForAllophoneRoman({ kind: 'absent' })).toMatch(/not provided/i);
	});
});

describe('format / formatBytes', () => {
	it('formats bytes < 1 KiB with the B suffix', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(1023)).toBe('1023 B');
	});

	it('formats KiB with one decimal place', () => {
		expect(formatBytes(1024)).toBe('1.0 KiB');
		expect(formatBytes(1536)).toBe('1.5 KiB');
	});

	it('formats MiB with one decimal place', () => {
		expect(formatBytes(1024 * 1024)).toBe('1.0 MiB');
		expect(formatBytes(16 * 1024 * 1024)).toBe('16.0 MiB');
	});

	it('formats GiB with one decimal place', () => {
		expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GiB');
	});
});

describe('format / summarizeInventory', () => {
	it('returns the empty placeholder when isEmpty', () => {
		const summary = summarizeInventory({ rootCount: 0, allophoneCount: 0, isEmpty: true });
		expect(summary).toBe(NO_PHONEMES_PLACEHOLDER);
	});

	it('uses singular for one phoneme', () => {
		const summary = summarizeInventory({ rootCount: 1, allophoneCount: 0, isEmpty: false });
		expect(summary).toBe('1 phoneme');
	});

	it('uses plural for many phonemes', () => {
		const summary = summarizeInventory({ rootCount: 5, allophoneCount: 0, isEmpty: false });
		expect(summary).toBe('5 phonemes');
	});

	it('includes allophone count when > 0', () => {
		const summary = summarizeInventory({ rootCount: 5, allophoneCount: 3, isEmpty: false });
		expect(summary).toBe('5 phonemes, 3 allophones');
	});

	it('singular allophone', () => {
		const summary = summarizeInventory({ rootCount: 5, allophoneCount: 1, isEmpty: false });
		expect(summary).toBe('5 phonemes, 1 allophone');
	});
});

describe('format / placeholders', () => {
	it('exposes a deliberate "No description provided" string', () => {
		expect(NO_DESCRIPTION_PLACEHOLDER).toBe('No description provided.');
	});

	it('exposes deliberate "no phonemes / roots / allophones" placeholders', () => {
		expect(NO_PHONEMES_PLACEHOLDER).toBeTruthy();
		expect(NO_ROOTS_PLACEHOLDER).toBeTruthy();
		expect(NO_ALLOPHONES_PLACEHOLDER).toBeTruthy();
	});
});

describe('format / accessibility labels', () => {
	it('exposes a picker label, drop-zone label, replace label, cancel label', () => {
		expect(UPLOAD_PICKER_LABEL).toBeTruthy();
		expect(UPLOAD_DROP_ZONE_LABEL).toBeTruthy();
		expect(REPLACE_FILE_LABEL).toBe('Upload another file');
		expect(CANCEL_LABEL).toBe('Cancel');
	});
});
