import { describe, expect, it } from 'vitest';
import { checkSelection, formatFileSize, hasAcceptedExtension } from './validate';
import { ACCEPTED_EXTENSION, MAX_FILE_BYTES } from './limits';

function file(name: string, size = 1024, type = 'application/vnd.elang'): File {
	return new File([new Uint8Array(size)], name, { type });
}

describe('hasAcceptedExtension', () => {
	it('accepts the lower-case extension', () => {
		expect(hasAcceptedExtension(`phonemes${ACCEPTED_EXTENSION}`)).toBe(true);
	});

	it('accepts the upper-case extension', () => {
		expect(hasAcceptedExtension(`phonemes${ACCEPTED_EXTENSION.toUpperCase()}`)).toBe(true);
	});

	it('rejects other extensions', () => {
		expect(hasAcceptedExtension('phonemes.txt')).toBe(false);
	});
});

describe('formatFileSize', () => {
	it('formats bytes', () => {
		expect(formatFileSize(500)).toBe('500 B');
	});

	it('formats kilobytes', () => {
		expect(formatFileSize(1500)).toBe('1.5 kB');
	});

	it('formats megabytes', () => {
		expect(formatFileSize(2_500_000)).toBe('2.5 MB');
	});
});

describe('checkSelection (H0103)', () => {
	it('rejects an empty selection', () => {
		expect(checkSelection(null)?.code).toBe('NO_FILE_SELECTED');
		expect(checkSelection([] as File[])?.code).toBe('NO_FILE_SELECTED');
	});

	it('rejects more than one file', () => {
		const files = [file('one.elang'), file('two.elang')];
		expect(checkSelection(files)?.code).toBe('TOO_MANY_FILES');
	});

	it('rejects a file with the wrong extension', () => {
		expect(checkSelection([file('notes.txt')])?.code).toBe('UNSUPPORTED_EXTENSION');
	});

	it('rejects an empty file', () => {
		expect(checkSelection([file('phonemes.elang', 0)])?.code).toBe('FILE_EMPTY');
	});

	it('rejects an oversized file', () => {
		expect(checkSelection([file('phonemes.elang', MAX_FILE_BYTES + 1)])?.code).toBe(
			'FILE_TOO_LARGE'
		);
	});

	it('accepts a valid selection', () => {
		expect(checkSelection([file('phonemes.elang')])).toBeNull();
	});
});
