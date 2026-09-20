/**
 * Returns the given string with the first letter in upper case.
 *
 * @param input The string to convert.
 */
export function ucfirst(input: string): string {
	return input.charAt(0).toUpperCase() + input.slice(1);
}

/**
 * Rounds the given number to two decimals.
 *
 * @param input The number to round.
 */
export function roundToTwo(input: number): number {
	return Math.round(input * 100) / 100;
}

export function negativeOneToInfinity(value: number): number {
	return value === -1 ? Number.POSITIVE_INFINITY : value;
}

/**
 * The largest delay `setTimeout` can honor.
 *
 * The delay is treated as a 32-bit signed integer, so anything from 2^31
 * upwards is silently truncated: 1e12 becomes a negative number (which is
 * treated as 0) and 1e300 becomes 0 outright. An interval that a player set to
 * "a lot" therefore turns the loop into a busy loop that never yields. An hour
 * is already far beyond any interval anyone would configure deliberately.
 */
export const MaxTimeoutDelay = 3_600_000;

/**
 * Clamps a delay into the range the browser can honor.
 *
 * A delay that isn't a finite number — a corrupted or hand-edited setting —
 * falls back to the given default, because it would otherwise come out of
 * `setTimeout` as 0 as well.
 *
 * @param delay - The configured delay, in milliseconds.
 * @param fallback - The delay to use when `delay` isn't a usable number.
 * @returns A delay between 10 and {@link MaxTimeoutDelay} milliseconds.
 */
export function clampTimeoutDelay(delay: number, fallback: number): number {
	const value = Number.isFinite(delay) ? delay : fallback;
	if (!Number.isFinite(value)) {
		return 10;
	}

	return Math.min(Math.max(10, value), MaxTimeoutDelay);
}
