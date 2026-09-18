import { isNil } from "@oliversalzburg/js-utils/data/nil.js";
import type { KittenScientists } from "../KittenScientists.js";
import type { UnsafeBuilding } from "../types/buildings.js";
import type { Price, Resource, TabId } from "../types/index.js";
import type {
	UnsafeReligionUpgrade,
	UnsafeTranscendenceUpgrade,
	UnsafeZigguratUpgrade,
} from "../types/religion.js";
import type { UnsafeSpaceBuilding } from "../types/space.js";
import type {
	UnsafeChronoForgeUpgrade,
	UnsafeVoidSpaceUpgrade,
} from "../types/time.js";

export type PriceRatioData =
	| UnsafeBuilding
	| UnsafeChronoForgeUpgrade
	| UnsafeReligionUpgrade
	| UnsafeSpaceBuilding
	| UnsafeTranscendenceUpgrade
	| UnsafeVoidSpaceUpgrade
	| UnsafeZigguratUpgrade;

/**
 * The resources chronospheres carry over into the next run.
 *
 * Only non-crafted, non-luxury resources are preserved. Luxury resources are
 * lost on every reset, and crafted ones only survive with the Flux Condensator
 * upgrade — and then by `sqrt(amount) * 1.5 * chronospheres`, not by share, so
 * a price budget says nothing about them either.
 */
export const PreservedResources: ReadonlySet<Resource> = new Set<Resource>([
	"antimatter",
	"blackcoin",
	"catnip",
	"coal",
	"culture",
	"faith",
	"gold",
	"iron",
	// The game calls this "catpower".
	"manpower",
	"minerals",
	"oil",
	"relic",
	"science",
	"starchart",
	"titanium",
	"unobtainium",
	"uranium",
	"void",
	"wood",
]);

/**
 * Does a chronosphere carry this resource over into the next run?
 */
export const isPreservedResource = (resource: Resource): boolean =>
	PreservedResources.has(resource);

/**
 * The `prices` of a piece of build metadata, if it carries any.
 *
 * Staged and unstaged metadata only share this field by convention, so it is
 * read through the object index rather than through the declared type.
 */
const pricesOf = (data: object): Array<Price> => {
	const candidate = (data as Record<string, unknown>).prices;
	return Array.isArray(candidate) ? (candidate as Array<Price>) : [];
};

/**
 * The prices a build pays, including every stage of a staged build.
 */
const collectPrices = (data: PriceRatioData): Array<Price> => {
	const prices = pricesOf(data);

	if (isStagedBuild(data)) {
		for (const stage of data.stages) {
			prices.push(...pricesOf(stage));
		}
	}

	return prices;
};

/**
 * Does this build pay for anything a chronosphere would carry over?
 *
 * A build that only costs crafted or luxury resources can't dent what the next
 * run starts with, so the carry-over estimate doesn't apply to it.
 */
export const spendsPreservedResource = (data: PriceRatioData): boolean =>
	collectPrices(data).some((price) => isPreservedResource(price.name));

/**
 * How many chronospheres it takes before a reset leaves you with more than you
 * started with: every one preserves 1.5%, so 67 of them preserve 100.5%.
 */
export const ChronospheresForGrowth = 67;

const isStagedBuild = (
	// biome-ignore lint/suspicious/noExplicitAny: This is currently too hard to work around.
	data: any,
): data is {
	stage: number;
	stages: Array<{ priceRatio: number }>;
} =>
	"stage" in data &&
	"stages" in data &&
	!isNil(data.stage) &&
	!isNil(data.stages);

/**
 * Determine the price modifier for the given building.
 *
 * This is the factor by which the price of a unit grows for every unit already
 * owned. Bonfire buildings are additionally discounted by a couple of
 * permanent upgrades, which is why they need the tab id.
 *
 * @param host A reference to the host.
 * @param data The building metadata.
 * @param source The tab the building belongs to.
 * @returns The price modifier for this building.
 * @see `getPriceRatioWithAccessor`@`buildings.js`
 */
export const resolvePriceRatio = (
	host: KittenScientists,
	data: PriceRatioData,
	source?: TabId,
): number => {
	const ratio = isStagedBuild(data)
		? data.priceRatio || data.stages[data.stage].priceRatio
		: (data.priceRatio ?? 0);

	let ratioDiff = 0;
	if (source && source === "Bonfire") {
		ratioDiff =
			host.game.getEffect(`${data.name}PriceRatio` as const) +
			host.game.getEffect("priceRatio") +
			host.game.getEffect("mapPriceReduction");

		ratioDiff = host.game.getLimitedDR(ratioDiff, ratio - 1);
	}

	return ratio + ratioDiff;
};

/**
 * How much of the spendable stock a price budget can burn through in a single
 * cycle.
 *
 * The budget limits the price of a *single* unit, but a cycle keeps building
 * units until one of them crosses the budget. Because prices grow
 * geometrically, the resulting total spend is amplified by `r / (r - 1)`.
 *
 * @param budget The share of the spendable stock a single unit may cost.
 * @param priceRatio The price modifier of the building in question.
 * @returns The share of the spendable stock one cycle can consume, or
 * `undefined` when no meaningful estimate is possible.
 */
export const budgetSpendShare = (
	budget: number,
	priceRatio: number,
): number | undefined => {
	// A non-finite or non-positive budget can't be turned into a spend share.
	if (!Number.isFinite(budget) || budget <= 0) {
		return undefined;
	}

	// A price modifier at or below 1 means prices don't grow, so a chain build
	// has no natural end and no upper bound on what it can consume.
	if (!Number.isFinite(priceRatio) || priceRatio <= 1) {
		return undefined;
	}

	return Math.min(1, (budget * priceRatio) / (priceRatio - 1));
};

/**
 * The most aggressive price ratio among the given builds.
 *
 * A whole section doesn't have a single price ratio, so this picks the one
 * that amplifies a price budget the most — the lowest ratio above 1. That
 * makes any estimate based on it a worst-case one.
 *
 * @returns The lowest usable price ratio, or `undefined` when none of the
 * builds has one.
 */
export const mostAggressivePriceRatio = (
	host: KittenScientists,
	builds: Iterable<PriceRatioData>,
	source?: TabId,
): number | undefined => {
	let worst: number | undefined;

	for (const build of builds) {
		let ratio: number;
		try {
			ratio = resolvePriceRatio(host, build, source);
		} catch {
			// A build we can't price (an unresearched upgrade, say) simply
			// doesn't take part in the estimate.
			continue;
		}

		if (!Number.isFinite(ratio) || ratio <= 1) {
			continue;
		}

		if (worst === undefined || ratio < worst) {
			worst = ratio;
		}
	}

	return worst;
};

/**
 * The share of the stock that chronospheres carry over into the next run.
 *
 * Every chronosphere preserves a fixed share of the non-craftable resources,
 * so this doubles as the share of the stock a run can burn through without
 * ending up behind where it started.
 *
 * @returns The preserved share, or 0 when no chronosphere is standing.
 */
export const chronoStasisShare = (host: KittenScientists): number => {
	const value = host.game.getEffect("resStasisRatio");
	return Number.isFinite(value) && 0 < value ? value : 0;
};

/**
 * How many chronospheres are currently standing.
 */
export const chronosphereCount = (host: KittenScientists): number => {
	const value = host.game.bld.getBuildingExt("chronosphere").meta.val;
	return Number.isFinite(value) && 0 < value ? value : 0;
};

/**
 * The share of the stock a cycle may burn through and still end up with more
 * than the run started with.
 *
 * Chronospheres carry over `k` of what is left, so a cycle that spends the
 * share `f` hands the next run `k * (1 - f)` of the stock. That only grows
 * while `k * (1 - f) > 1`, which resolves to `f < 1 - 1/k`.
 *
 * Below `ChronospheresForGrowth` (67) chronospheres `k` is at most 100%, so no
 * amount of thrift grows the stock and there is no allowance at all.
 *
 * @returns The spendable share, or `undefined` when the stock shrinks no matter
 * what — including when no chronosphere is standing.
 */
export const chronoSafeSpendShare = (
	host: KittenScientists,
): number | undefined => {
	const stasis = chronoStasisShare(host);
	if (stasis <= 1) {
		return undefined;
	}

	const share = 1 - 1 / stasis;
	return Number.isFinite(share) && 0 < share ? share : undefined;
};

/**
 * A ready-to-type price budget recommendation for the current situation.
 *
 * Takes the price ratio the budget would apply to and answers "what should I
 * type into the field": 80% of the hard limit `f * (r - 1) / r`, where `f` is
 * the safe spend share of the standing chronospheres. Rounding and display are
 * up to the caller.
 *
 * @returns The recommendation with the hard limit and the chronosphere count,
 * or `undefined` when there is no meaningful recommendation — the ratio is
 * unusable, or the stock shrinks no matter what (fewer than
 * `ChronospheresForGrowth` chronospheres).
 */
export const recommendedPriceBudget = (
	host: KittenScientists,
	priceRatio: number | undefined,
): { budget: number; limit: number; chronos: number } | undefined => {
	if (
		priceRatio === undefined ||
		!Number.isFinite(priceRatio) ||
		priceRatio <= 1
	) {
		return undefined;
	}

	const allowance = chronoSafeSpendShare(host);
	if (allowance === undefined) {
		return undefined;
	}

	const limit = (allowance * (priceRatio - 1)) / priceRatio;
	if (!Number.isFinite(limit) || limit <= 0) {
		return undefined;
	}

	return {
		budget: limit * 0.8,
		limit,
		chronos: chronosphereCount(host),
	};
};

const fmtShare = (share: number): string => {
	const pct = share * 100;
	if (pct >= 1) {
		return `${Math.round(pct)}%`;
	}
	if (pct >= 0.01) {
		return `${pct.toFixed(2)}%`;
	}
	if (pct > 0) {
		return `${pct.toPrecision(2)}%`;
	}
	return "0%";
};

export type GrowthRisk = {
	share: number;
	chrono: number;
	allowance: number | undefined;
	details: string | undefined;
};

/**
 * Estimate how much of the stock one automated cycle would actually burn for
 * this build, honoring the price budget (per-unit veto), the build's max,
 * and each resource's real stock — then compare it against what the
 * chronospheres carry over.
 *
 * The theoretical model (`budget × r ÷ (r − 1)`) is only reached when the
 * chain is long enough for the budget to bind. With huge stockpiles and a
 * small `max`, actual consumption can be orders of magnitude below it, and
 * a warning based on the model alone would be pure noise.
 *
 * @returns The worst-resource actual share with a per-resource breakdown,
 * or `undefined` when the cycle stays within the growth line (or when
 * growth is impossible regardless — fewer than `ChronospheresForGrowth`
 * chronospheres, reported with `allowance: undefined`).
 */
export const chronoGrowthRisk = (
	host: KittenScientists,
	data: PriceRatioData,
	budget: number,
	maxRemaining: number | undefined,
	source?: TabId,
): GrowthRisk | undefined => {
	const chrono = chronoStasisShare(host);
	if (chrono <= 0) {
		return undefined;
	}
	const allowance = 1 < chrono ? 1 - 1 / chrono : undefined;

	if (allowance === undefined) {
		// Fewer than ChronospheresForGrowth: the stock shrinks no matter how
		// thrifty the budget is.
		return { share: 1, chrono, allowance: undefined, details: undefined };
	}

	const ratio = resolvePriceRatio(host, data, source);
	if (!Number.isFinite(ratio) || ratio <= 1) {
		return undefined;
	}

	let worst = 0;
	const over: Array<string> = [];
	const rest: Array<string> = [];
	for (const price of collectPrices(data)) {
		const resource = host.engine.workshopManager.getResource(price.name);
		const stock = resource?.value ?? 0;
		const preserved = isPreservedResource(price.name);

		let share = 0;
		if (preserved && 0 < stock && 0 < price.val) {
			// Chain length under the per-unit budget veto: units cost
			// p₀·rⁱ, and the veto stops at the first unit above
			// stock × budget.
			const cap = stock * budget;
			let chain =
				price.val < cap
					? Math.floor(Math.log(cap / price.val) / Math.log(ratio))
					: 0;
			if (maxRemaining !== undefined) {
				chain = Math.min(chain, maxRemaining);
			}
			share = Math.min(
				1,
				(price.val * (ratio ** chain - 1)) / ((ratio - 1) * stock),
			);
		}
		if (preserved) {
			worst = Math.max(worst, share);
		}
		const title = (resource as { title?: string } | undefined)?.title;
		const text = `${title ?? price.name} ${fmtShare(share)}${preserved ? "" : "*"}`;
		(preserved ? over : rest).push(text);
	}

	if (worst <= allowance) {
		return undefined;
	}

	return {
		share: worst,
		chrono,
		allowance,
		details: [...over, ...rest].join("、"),
	};
};
