/**
 * Tests for the page-level error mapper.
 *
 * The mapper is total — every `PhonemeRequestOutcome` produces
 * one `PhonemePageErrorInfo`. The tests pin the mapping for each
 * `kind`, and pin the control-stripping and length bounds
 * for untrusted content.
 */

import { describe, expect, it } from 'vitest';
import {
	httpErrorOutcome,
	mapRequestOutcome,
	sdkErrorOutcome,
	transportErrorOutcome,
	viewOutcome
} from './error-mapper';
import type { PhonemeRequestOutcome } from './index';
import type { HubError } from '../sdk/errors';
import type { PhonemeViewResult } from '../view';
import { PHONEME_VIEW_EXTRACTION_FAILED } from '../view';

function hubError(overrides: Partial<HubError> = {}): HubError {
	return {
		stage: 'validate',
		code: 'phoneme_inventory_invalid',
		message: 'The phoneme inventory (ELD) is invalid.',
		...overrides
	};
}

function okView(): PhonemeViewResult {
	return {
		ok: true,
		view: Object.freeze({
			package: {
				identifier: 'urn:elang:language:t:t:1.0.0',
				namespace: 't',
				languageName: 't',
				languageVersion: '1.0.0',
				name: 'T',
				description: null,
				specVersions: Object.freeze({ specVersion: '0.0.1-1', binaryContainerVersion: '0.1.0' })
			},
			phonemeResourcePath: 'Linguistics/phonemes.eld',
			inventory: Object.freeze({ groups: [], rootCount: 0, allophoneCount: 0, isEmpty: true }),
			diagnostics: []
		})
	};
}

function failedView(): Extract<PhonemeViewResult, { ok: false }> {
	return {
		ok: false,
		code: PHONEME_VIEW_EXTRACTION_FAILED,
		message: 'The validated phoneme inventory could not be read.',
		path: 'inventory.groups[2]',
		cause: { code: 'groups_invalid', message: 'x', path: 'inventory.groups' }
	};
}

describe('error-mapper / mapRequestOutcome', () => {
	it('maps a successful view to a defensive fallback (controller should not call this path)', () => {
		const outcome: PhonemeRequestOutcome = viewOutcome(okView());
		const info = mapRequestOutcome(outcome);
		expect(info.title).toBeTruthy();
		expect(info.message).toBeTruthy();
	});

	it('maps an extraction failure to a bounded message and detail', () => {
		const outcome = viewOutcome(failedView());
		const info = mapRequestOutcome(outcome);
		expect(info.message).toMatch(/inventory/i);
		expect(info.detail).toBe('inventory.groups[2]');
	});

	it('maps an extraction failure without a path to a message without detail', () => {
		const outcome = viewOutcome({
			ok: false,
			code: PHONEME_VIEW_EXTRACTION_FAILED,
			message: 'No path here',
			cause: { code: 'inventory_not_object', message: 'x' }
		});
		const info = mapRequestOutcome(outcome);
		expect(info.detail).toBeUndefined();
		expect(info.message).toBe('No path here');
	});

	it('maps an SDK error (inspect stage) to "Package structure invalid" title', () => {
		const outcome = sdkErrorOutcome(
			hubError({
				stage: 'inspect',
				code: 'malformed_package',
				message: 'The uploaded file is not a valid ELANG package.'
			})
		);
		const info = mapRequestOutcome(outcome);
		expect(info.title).toMatch(/structure/i);
		expect(info.message).toMatch(/not a valid ELANG package/i);
	});

	it('maps an SDK error (verify stage) to "Integrity check failed" title', () => {
		const outcome = sdkErrorOutcome(hubError({ stage: 'verify', code: 'integrity_check_failed' }));
		const info = mapRequestOutcome(outcome);
		expect(info.title).toMatch(/integrity/i);
	});

	it('maps an SDK error (validate stage) to "Validation failed" title', () => {
		const outcome = sdkErrorOutcome(
			hubError({ stage: 'validate', code: 'phoneme_inventory_invalid' })
		);
		const info = mapRequestOutcome(outcome);
		expect(info.title).toMatch(/validation/i);
	});

	it('preserves HTML-special characters in the SDK detail path', () => {
		const outcome = sdkErrorOutcome(
			hubError({
				stage: 'validate',
				code: 'phoneme_inventory_invalid',
				detail: 'inventory<\'"&>.groups[0]'
			})
		);
		const info = mapRequestOutcome(outcome);
		expect(info.detail).toBe('inventory<\'"&>.groups[0]');
	});

	it.each(['view', 'sdk_error', 'http_error'] as const)(
		'preserves detail text and strips all C0 controls and DEL for %s',
		(kind) => {
			const text = 'inventory<\'"&>.groups[0] &lt; \u0080';
			const controls = String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i), 127);
			const detail = controls + text;
			const outcomes = {
				view: viewOutcome({ ...failedView(), path: detail }),
				sdk_error: sdkErrorOutcome(hubError({ detail })),
				http_error: httpErrorOutcome(500, detail)
			};
			expect(mapRequestOutcome(outcomes[kind]).detail).toBe(text);
		}
	);

	it('maps HTTP 413 to "Package too large"', () => {
		const outcome = httpErrorOutcome(413);
		const info = mapRequestOutcome(outcome);
		expect(info.title).toMatch(/large/i);
		expect(info.message).toMatch(/16 MiB/i);
	});

	it('maps HTTP 408 / 504 to "Validation timed out"', () => {
		expect(mapRequestOutcome(httpErrorOutcome(408)).title).toMatch(/timed out/i);
		expect(mapRequestOutcome(httpErrorOutcome(504)).title).toMatch(/timed out/i);
	});

	it('maps HTTP 5xx to "Validation service unavailable"', () => {
		expect(mapRequestOutcome(httpErrorOutcome(502)).title).toMatch(/unavailable/i);
		expect(mapRequestOutcome(httpErrorOutcome(503)).title).toMatch(/unavailable/i);
		expect(mapRequestOutcome(httpErrorOutcome(500)).title).toMatch(/unavailable/i);
	});

	it('maps unknown HTTP codes to a generic "Validation failed" with the status code', () => {
		const info = mapRequestOutcome(httpErrorOutcome(418));
		expect(info.title).toMatch(/failed/i);
		expect(info.message).toMatch(/418/);
	});

	it('preserves the HTTP detail for text interpolation', () => {
		const info = mapRequestOutcome(httpErrorOutcome(500, '<script>'));
		expect(info.detail).toBe('<script>');
	});

	it('maps transport offline to "Network unavailable"', () => {
		const info = mapRequestOutcome(transportErrorOutcome('offline'));
		expect(info.title).toMatch(/network/i);
		expect(info.message).toMatch(/network connection/i);
	});

	it('maps transport aborted to "Validation cancelled"', () => {
		const info = mapRequestOutcome(transportErrorOutcome('aborted'));
		expect(info.title).toMatch(/cancel/i);
	});

	it('maps transport unknown to "Unexpected failure"', () => {
		const info = mapRequestOutcome(transportErrorOutcome('unknown'));
		expect(info.title).toMatch(/unexpected/i);
	});

	it('bounds every message to MAX_MESSAGE_LENGTH', () => {
		const huge = 'x'.repeat(1000);
		const outcome = sdkErrorOutcome(hubError({ message: huge }));
		const info = mapRequestOutcome(outcome);
		expect(info.message.length).toBeLessThanOrEqual(280);
		expect(info.message.endsWith('…')).toBe(true);
	});

	it('bounds every detail to MAX_DETAIL_LENGTH', () => {
		const huge = 'x'.repeat(1000);
		const outcome = sdkErrorOutcome(hubError({ detail: huge }));
		const info = mapRequestOutcome(outcome);
		expect((info.detail ?? '').length).toBeLessThanOrEqual(200);
	});

	it('bounds every title to MAX_TITLE_LENGTH', () => {
		const outcome: PhonemeRequestOutcome = {
			kind: 'http_error',
			status: 418
		};
		const info = mapRequestOutcome(outcome);
		// title is fixed strings; verify it never exceeds the bound for any code.
		expect(info.title.length).toBeLessThanOrEqual(80);
	});
});
