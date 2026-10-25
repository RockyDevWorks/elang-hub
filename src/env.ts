import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	/**
	 * The validation service.
	 *
	 * v0.1.0 keeps the service stateless: it validates the package and
	 * returns a verdict, and retains nothing (REQ-HUB-003). The endpoint
	 * is configured per deployment; without it the route reports that
	 * validation is unavailable rather than pretending to validate.
	 */
	VALIDATION_SERVICE_URL: {
		// An unset service URL keeps validation unavailable without preventing startup.
		schema: (value) => value
	}
});
