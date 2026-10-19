import manifest from "./package.json" with { type: "json" };

// The fork stamps local builds with the same short code used for file names:
// YY + ISO week + weekday + hour letter + 5-minute slot letter, e.g. 26427RY.
// It stays monotonic within a day and reads like a release identifier, unlike a
// running counter. RELEASE_VERSION still wins when set explicitly.
const HOURS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const SLOTS = "0123456789XY";

/**
 * ISO-8601 week number of a date (weeks start on Monday, week 1 contains the first
 * Thursday of the year).
 * @param {Date} date
 * @returns {number}
 */
function isoWeek(date) {
	const target = new Date(
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
	);
	const weekday = (target.getUTCDay() + 6) % 7;
	target.setUTCDate(target.getUTCDate() - weekday + 3);
	const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
	const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
	const diffDays = (target.getTime() - firstThursday.getTime()) / 86400000;
	return 1 + Math.round((diffDays - 3 + firstWeekday) / 7);
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
export function isoTag(date = new Date()) {
	const yy = String(date.getFullYear()).slice(-2);
	const ww = String(isoWeek(date)).padStart(2, "0");
	const dd = String(((date.getDay() + 6) % 7) + 1);
	const hour = HOURS[date.getHours()] ?? "A";
	const slot = SLOTS[Math.floor(date.getMinutes() / 5)] ?? "0";
	return `${yy}${ww}${dd}${hour}${slot}`;
}

export const buildVersion =
	process.env.RELEASE_VERSION ?? `${manifest.version}-zh-CN.${isoTag()}`;
