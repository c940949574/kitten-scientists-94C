/**
 * Parsing of numeric user input.
 *
 * The game happily works with values far beyond what a 32-bit integer can hold,
 * and it keeps scaling them up. This module exists so that every place which
 * turns user input into a number accepts the exact same syntax, and so that it
 * never silently turns a value into something else:
 *
 * - `52` – a plain number
 * - `52.7` – a number with decimals
 * - `1e42` – scientific notation, including a negative or explicit exponent
 * - `1.5K`, `2M`, `3G`, `4T`, `5P`, `6E`, `7Z`, `8Y`, `9U`, `2S`, `1H` – the
 *   postfixes the game uses for display
 * - `∞` – the game's symbol for "no limit"
 *
 * The mantissa and the postfix may be combined, so `1e3K` is accepted and means
 * the same as `1M`.
 *
 * The game composes postfixes: when a value is large enough to clear a postfix
 * on the display, it is divided by that postfix and the process repeats on the
 * remainder, appending letters as it goes. `WS` therefore means ×1e42 ×1e30 and
 * `WWM` means ×1e42 ×1e42 ×1e6 — any sequence of the letters below is accepted,
 * matching whatever the game displays.
 *
 * Supported by the two percentage-aware fields (see `parsePercentageInput`):
 *
 * - `52%` – a share of a maximum, parsed as the number `0.52`
 */

export interface ParsedAbsolute {
	readonly kind: "absolute";
	readonly value: number;
}

export interface ParsedPercentage {
	readonly kind: "percentage";
	readonly value: number;
}

/**
 * Input that can't be read as a number.
 *
 * This is reported as a value of its own, instead of as a `null` result, so
 * that callers which have to return a number regardless (like
 * `parsePercentage`) can keep the current value instead of storing `NaN`.
 */
export interface ParsedInvalid {
	readonly kind: "invalid";
}

export type ParsedEntry = ParsedAbsolute | ParsedPercentage | ParsedInvalid;

/** The result of parsing input that might be a number, or might be nothing. */
export type ParseEntryResult = ParsedEntry | null;

/**
 * Matches the syntax accepted by `parseAbsoluteEntry`.
 *
 * The mantissa and its exponent are captured separately, so that the exponent
 * of a postfix can be folded into an exponent the input already carries. The
 * postfix is kept as a whole sequence of letters, because the game composes
 * them (`WS`, `WWM`, …).
 */
export const NUMBER_PATTERN = /^(\d+(?:\.\d+)?)(?:e([+-]?\d+))?([A-Za-z]*)$/;

/**
 * The decimal exponent of every postfix letter the game displays.
 *
 * Mirrors the `postfixes` table of the game (`core.js`/`game.js`), which is
 * ordered largest first and divides the value by its divisor each time a limit
 * is cleared: `Q` 1e210, `W` 1e42, `L` 1e39, `F` 1e36, `H` 1e33, `S` 1e30,
 * `U` 1e27, then the classic `Y` 1e24 down to `K` 1e3.
 */
const POSTFIX_EXPONENTS: Record<string, number> = {
	K: 3,
	M: 6,
	G: 9,
	T: 12,
	P: 15,
	E: 18,
	Z: 21,
	Y: 24,
	U: 27,
	S: 30,
	H: 33,
	F: 36,
	L: 39,
	W: 42,
	Q: 210,
};

/**
 * Combine a mantissa, its exponent and the exponent of a postfix sequence into
 * a number.
 *
 * The exponents are added up before anything is parsed, so that the result is
 * assembled as a single numeric literal: `Number("1e308") * 1000` would
 * overflow into `Infinity`, while `Number("1e308e3")` still reports the highest
 * value the engine can represent. Folding the exponents together instead of
 * appending a second one is what makes inputs like `1e3K` (which the mantissa
 * owns an exponent of 3 and the postfix another 3, giving `1e6`) come out
 * right; appending them would produce the literal `1e3e3`, which is not a
 * number at all.
 *
 * @param mantissa - The value without its exponent or postfix, e.g. `1.5`.
 * @param exponent - The exponent the mantissa already carries, e.g. `10` for
 * `1.5e10`. May be absent.
 * @param postfixExponent - The combined exponent of the postfix sequence, e.g.
 * `72` for `WS` (1e42 × 1e30).
 * @returns The parsed value, or `null` if it isn't representable in a number.
 */
function applyExponent(
	mantissa: string,
	exponent: string | undefined,
	postfixExponent: number,
): number | null {
	const totalExponent = Number.parseInt(exponent ?? "0", 10) + postfixExponent;
	const literal =
		totalExponent === 0 ? mantissa : `${mantissa}e${totalExponent}`;

	const value = Number(literal);
	return Number.isFinite(value) ? value : null;
}

/**
 * Parses user input into an absolute value.
 *
 * This never returns an infinity. A value that isn't representable as a number
 * is reported as `null`, so that callers can treat it the same way as input
 * they couldn't parse at all, instead of silently storing `Infinity`.
 *
 * @param value - User input, e.g. `52`, `1e42` or `4.2T`.
 * @returns The parsed value, or `null` if the input isn't a valid number.
 */
export function parseAbsoluteEntry(value: string): ParsedAbsolute | null {
	if (value === "" || value === "∞") {
		return null;
	}

	const match = NUMBER_PATTERN.exec(value.trim());
	if (match === null) {
		return null;
	}

	// The postfix is a sequence of the game's display letters; anything else
	// is not a value we understand.
	let postfixExponent = 0;
	for (const letter of match[3].toUpperCase()) {
		const exponent = POSTFIX_EXPONENTS[letter];
		if (exponent === undefined) {
			return null;
		}
		postfixExponent += exponent;
	}

	const number = applyExponent(match[1], match[2], postfixExponent);
	if (number === null || number < 0) {
		return null;
	}

	return { kind: "absolute", value: number };
}

/**
 * Parses user input into either an absolute value or a share of a maximum.
 *
 * The mode is selected by the input itself: a trailing `%` turns the value into
 * a share (so `50%` becomes `0.5`), anything else is an absolute value.
 *
 * @param value - User input, e.g. `50%`, `52` or `1e42`.
 * @returns The parsed entry, or `null` if the input was empty.
 */
export function parsePercentageEntry(value: string): ParseEntryResult {
	if (value.trim() === "") {
		return null;
	}

	const trimmedValue = value.trim();
	const match = trimmedValue.endsWith("%")
		? /^(.*)%$/.exec(trimmedValue)
		: null;
	if (match === null) {
		const absoluteValue = parseAbsoluteEntry(value);
		return absoluteValue ?? { kind: "invalid" };
	}

	const percentage = parseAbsoluteEntry(match[1]);
	if (percentage === null) {
		return { kind: "invalid" };
	}

	// A share of a maximum can't be negative or exceed the maximum. Clamping is
	// what the engine has always done for percentages; it keeps the stored value
	// range intact.
	return {
		kind: "percentage",
		value: Math.max(0, Math.min(1, percentage.value / 100)),
	};
}
