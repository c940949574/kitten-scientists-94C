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
 * - `1.5K`, `2M`, `3G`, `4T`, `5P`, `6E`, `7Z`, `8Y` – the postfixes the game
 *   uses for display
 * - `∞` – the game's symbol for "no limit"
 *
 * The mantissa and the postfix may be combined, so `1e3K` is accepted and means
 * the same as `1M`.
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
 * of a postfix can be folded into an exponent the input already carries.
 */
export const NUMBER_PATTERN = /^(\d+(?:\.\d+)?)(?:e([+-]?\d+))?([KMGTPEZY]?)$/i;

/** The multiplier for every postfix the game uses for display. */
const POSTFIX_FACTORS: Record<string, number> = {
	"": 1,
	K: 1000 ** 1,
	M: 1000 ** 2,
	G: 1000 ** 3,
	T: 1000 ** 4,
	P: 1000 ** 5,
	E: 1000 ** 6,
	Z: 1000 ** 7,
	Y: 1000 ** 8,
};

/**
 * Combine a mantissa, its exponent and a postfix multiplier into a number.
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
 * @param factor - The multiplier of the postfix, e.g. `1000` for `K`.
 * @returns The parsed value, or `null` if it isn't representable in a number.
 */
function applyFactor(
	mantissa: string,
	exponent: string | undefined,
	factor: number,
): number | null {
	// The postfixes are exact powers of ten, but they grow past 2^53, where the
	// decimal logarithm can land a hair off the integer it should be.
	const totalExponent =
		Number.parseInt(exponent ?? "0", 10) + Math.round(Math.log10(factor));
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

	const number = applyFactor(
		match[1],
		match[2],
		POSTFIX_FACTORS[match[3].toUpperCase()],
	);
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
