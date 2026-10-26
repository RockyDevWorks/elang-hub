/**
 * Tests for the user-facing error mapper (H0206).
 *
 * The Hub must surface every SDK failure as one of twelve stable
 * Hub error codes with a fixed, length-bounded, HTML-escaped message.
 * Untrusted content from the SDK (paths, messages) must never reach
 * the UI verbatim.
 */

import { describe, expect, it } from 'vitest';
import { firstBoundedDetail, toHubError } from './errors';
import type { SdkFailure } from './contract';

describe('toHubError (H0206)', () => {
	it.each(['inspect', 'verify', 'validate'] as const)(
		'preserves the %s stage with and without detail',
		(stage) => {
			for (const path of [undefined, 'resource.path']) {
				const hub = toHubError({
					ok: false,
					stage,
					code: 'unknown',
					message: 'x',
					path,
					diagnostics: []
				});
				expect(hub.stage).toBe(stage);
				expect(hub.detail).toBe(path);
			}
		}
	);

	const allSdkCodes: SdkFailure['code'][] = [
		'unsupported_spec_version',
		'unsupported_binary_container_version',
		'malformed_container',
		'corrupted_resource',
		'integrity_check_failed',
		'descriptor_invalid',
		'eld_invalid',
		'unsupported_feature',
		'service_unavailable',
		'request_too_large',
		'timeout',
		'cancelled',
		'malformed_response',
		'unknown'
	];

	it('maps every SDK error code to a known Hub code', () => {
		for (const code of allSdkCodes) {
			const failure: SdkFailure = {
				ok: false,
				stage: 'validate',
				code,
				message: 'whatever',
				diagnostics: []
			};
			const hub = toHubError(failure);
			expect(hub.code).toBeTruthy();
			expect(hub.message.length).toBeGreaterThan(0);
		}
	});

	it('coerces unsupported spec/container versions to the same Hub code', () => {
		const spec: SdkFailure = {
			ok: false,
			stage: 'inspect',
			code: 'unsupported_spec_version',
			message: 'x',
			diagnostics: []
		};
		const container: SdkFailure = {
			ok: false,
			stage: 'inspect',
			code: 'unsupported_binary_container_version',
			message: 'x',
			diagnostics: []
		};
		expect(toHubError(spec).code).toBe('unsupported_version');
		expect(toHubError(container).code).toBe('unsupported_version');
	});

	it('escapes HTML in the path so it cannot inject markup', () => {
		const failure: SdkFailure = {
			ok: false,
			stage: 'validate',
			code: 'eld_invalid',
			message: 'x',
			path: '<script>alert(1)</script>',
			diagnostics: []
		};
		const hub = toHubError(failure);
		expect(hub.detail).not.toContain('<script>');
		expect(hub.detail).toContain('&lt;script&gt;');
	});

	it('strips control characters from the path', () => {
		const failure: SdkFailure = {
			ok: false,
			stage: 'validate',
			code: 'eld_invalid',
			message: 'x',
			path: 'before\u0000\u001fafter',
			diagnostics: []
		};
		const hub = toHubError(failure);
		expect(hub.detail).toBe('beforeafter');
	});

	it('bounds the detail length so a hostile path cannot bloat the UI', () => {
		const failure: SdkFailure = {
			ok: false,
			stage: 'validate',
			code: 'eld_invalid',
			message: 'x',
			path: 'a'.repeat(10_000),
			diagnostics: []
		};
		const hub = toHubError(failure);
		// 280 chars + single ellipsis.
		expect(hub.detail?.length).toBeLessThanOrEqual(280);
		expect(hub.detail?.endsWith('…')).toBe(true);
	});

	it('omits detail when the SDK did not include a path', () => {
		const failure: SdkFailure = {
			ok: false,
			stage: 'validate',
			code: 'service_unavailable',
			message: 'x',
			diagnostics: []
		};
		const hub = toHubError(failure);
		expect(hub.detail).toBeUndefined();
	});
});

describe('firstBoundedDetail', () => {
	it('returns the first diagnostic path that is bounded and escaped', () => {
		const detail = firstBoundedDetail([
			{ stage: 'validate', code: 'eld_invalid', message: 'm' },
			{ stage: 'validate', code: 'eld_invalid', message: 'm', path: 'foo&bar' }
		]);
		expect(detail).toBe('foo&amp;bar');
	});

	it('returns undefined when no diagnostic has a path', () => {
		expect(
			firstBoundedDetail([{ stage: 'validate', code: 'eld_invalid', message: 'm' }])
		).toBeUndefined();
	});
});
