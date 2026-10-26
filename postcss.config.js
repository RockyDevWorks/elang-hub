/**
 * PostCSS configuration.
 *
 * Tailwind 4 is wired through its Vite plugin (`@tailwindcss/vite`),
 * not through a PostCSS plugin. Running it here as well would let
 * Vite's `@import` resolver treat `@import 'tailwindcss'` as a
 * filesystem path and fail the build with ENOENT. Autoprefixer
 * stays for the hand-written CSS in `src/app.css` (the IPA
 * typography stack), which Tailwind's own prefixer does not cover.
 */
export default {
	plugins: {
		autoprefixer: {}
	}
};
