import { isNil, mustExist } from "@oliversalzburg/js-utils/data/nil.js";
import type { Automation, FrameContext } from "./Engine.js";
import type { KittenScientists } from "./KittenScientists.js";
import { VillageSettings } from "./settings/VillageSettings.js";
import { objectEntries } from "./tools/Entries.js";
import { negativeOneToInfinity } from "./tools/Format.js";
import type { Resource, ResourceCraftable, Trait } from "./types/index.js";
import type { Kitten, UnsafeJob } from "./types/village.js";
import {
	ChemicalCrafts,
	MetallicCrafts,
	type WorkshopManager,
} from "./WorkshopManager.js";

export class VillageManager implements Automation {
	private readonly _host: KittenScientists;
	readonly settings: VillageSettings;
	private readonly _workshopManager: WorkshopManager;
	/** Last hunt timestamp, for automatic leader election. */
	private _lastHuntAt = 0;

	constructor(
		host: KittenScientists,
		workshopManager: WorkshopManager,
		settings = new VillageSettings(),
	) {
		this._host = host;
		this.settings = settings;
		this._workshopManager = workshopManager;
	}

	tick(context: FrameContext) {
		if (!this.settings.enabled) {
			return;
		}

		this.autoDistributeKittens(context);

		if (this.settings.hunt.enabled) {
			this.autoHunt();
		}

		if (this.settings.holdFestivals.enabled) {
			this.autoFestival();
		}

		if (this.settings.electLeader.enabled) {
			this.autoElect();
		}

		if (this.settings.promoteLeader.enabled) {
			this.autoPromoteLeader();
		}

		if (this.settings.promoteKittens.enabled) {
			this.autoPromoteKittens();
		}
	}

	autoDistributeKittens(context: FrameContext) {
		const freeKittens = this._host.game.village.getFreeKittens();
		if (!freeKittens) {
			return;
		}

		let remaining = freeKittens;
		let assigned = 0;
		let forcedFarmer = false;

		// Safety net: a village without a single farmer starves. Force one kitten into the
		// farmer job whenever it is unlocked and empty -- even when the job is disabled in
		// the settings, or the configured maximum would otherwise keep it at zero.
		const farmerJob = this._host.game.village.getJob("farmer");
		if (farmerJob?.unlocked && 0 >= farmerJob.value && 0 < remaining) {
			const farmerRoom =
				this._host.game.village.getJobLimit("farmer") - farmerJob.value;
			if (0 < farmerRoom) {
				this._host.game.village.assignJob(farmerJob, 1);
				remaining -= 1;
				assigned += 1;
				forcedFarmer = true;
			}
		}

		// Assigning one kitten at a time is quadratic: every `assignJob` call rescans and
		// re-sorts the entire kitten list and rebuilds the village tab. With tens of
		// thousands of jobless kittens that locks up the main thread, so plan the whole
		// distribution first and let the game apply it in bulk.
		const plans = new Array<{ job: UnsafeJob; count: number; room: number }>();
		for (const job of this._host.game.village.jobs) {
			// Skip disabled jobs and those that haven't been unlocked;
			if (!this.settings.jobs[job.name].enabled || !job.unlocked) {
				continue;
			}

			const maxKittensInJob = this._host.game.village.getJobLimit(job.name);
			const maxKittensToAssign = negativeOneToInfinity(
				this.settings.jobs[job.name].max,
			);
			const room = Math.min(maxKittensInJob, maxKittensToAssign) - job.value;
			if (0 < room) {
				plans.push({ count: job.value, job, room });
			}
		}

		const roomBefore = new Map<UnsafeJob, number>(
			plans.map((plan) => [plan.job, plan.room] as const),
		);

		const report = () => {
			if (0 >= assigned) {
				return;
			}
			context.requestGameUiRefresh = true;
			for (const plan of plans) {
				const amount = (roomBefore.get(plan.job) ?? 0) - plan.room;
				if (0 >= amount) {
					continue;
				}
				this._host.engine.iactivity(
					"kittens.distribute",
					"act.kittens.distributeBulk",
					[
						String(amount),
						this._host.engine.i18n(`$village.job.${plan.job.name}` as const),
					],
				);
			}
			if (forcedFarmer) {
				this._host.engine.iactivity(
					"kittens.distribute",
					"act.kittens.distributeBulk",
					["1", this._host.engine.i18n("$village.job.farmer")],
				);
			}
			this._host.engine.storeForSummary("kittens.distribute", assigned);
		};

		if (!plans.length) {
			report();
			return;
		}

		const distribute = (
			plan: { job: UnsafeJob; room: number },
			requested: number,
		) => {
			const amount = Math.min(plan.room, requested, remaining);
			if (0 >= amount) {
				return;
			}
			this._host.game.village.assignJob(plan.job, amount);
			plan.room -= amount;
			remaining -= amount;
			assigned += amount;
		};

		// Fill the jobs with the fewest kittens first, matching the old behavior of always
		// picking the least populated job, but in a handful of calls instead of one per
		// kitten.
		plans.sort((a, b) => a.count - b.count);
		for (let index = 0; index < plans.length && 0 < remaining; ++index) {
			const plan = plans[index];
			if (0 >= plan.room) {
				continue;
			}
			distribute(plan, Math.ceil(remaining / (plans.length - index)));
		}

		report();
	}

	autoElect(): void {
		// We can't assign a leader in the Anarchy challenge.
		if (this._host.game.challenges.isActive("anarchy")) {
			return;
		}

		const kittens = this._host.game.village.sim.kittens;
		const leader = this._host.game.village.leader;
		const electLeader = this.settings.electLeader;
		const jobSelection = electLeader.job.selected;
		const traitSelection = electLeader.trait.selected;

		// Theocracy requires the leader to have a specific job. Without it,
		// `makeLeader` would refuse every candidate and spam the game log.
		const theocracy = this._host.game.science.getPolicy("theocracy");
		const requiredJob = theocracy.researched
			? mustExist(theocracy.requiredLeaderJob)
			: null;
		const jobMatches = (kitten: Kitten) => {
			const targetJob = requiredJob ?? jobSelection;
			return targetJob === "any" || kitten.job === targetJob;
		};

		// In automatic mode, the desired trait is derived from the automations
		// which are currently enabled. Kittens with that trait are always
		// preferred over kittens with any other leader trait.
		const desiredTrait =
			traitSelection === "auto" ? this._getDesiredLeaderTrait() : null;
		const isEligible = (kitten: Kitten) =>
			desiredTrait === null
				? jobMatches(kitten) && kitten.trait.name === traitSelection
				: jobMatches(kitten) && kitten.trait.name !== "none";
		const tierOf = (kitten: Kitten) =>
			desiredTrait !== null && kitten.trait.name !== desiredTrait ? 1 : 0;

		const candidates = kittens
			.filter(isEligible)
			.map((kitten) => ({ kitten, tier: tierOf(kitten) }))
			.sort((a, b) => a.tier - b.tier || b.kitten.rank - a.kitten.rank);

		if (candidates.length === 0) {
			return;
		}

		const bestCandidate = candidates[0];
		if (!isNil(leader)) {
			// A leader who no longer matches the selection is always replaced.
			const leaderTier = isEligible(leader) ? tierOf(leader) : 2;
			if (
				leaderTier < bestCandidate.tier ||
				(leaderTier === bestCandidate.tier &&
					bestCandidate.kitten.rank <= leader.rank)
			) {
				return;
			}
		}

		// 换领袖免费且无游戏冷却；特质不匹配就立即换（含空位补位）。
		// 换人频率由特质切换决定（活动跟随/瀑布归位），不会每 tick 空转。
		this._host.game.village.makeLeader(bestCandidate.kitten);
		this._host.engine.iactivity("leader.elect", "act.leader.elect");
	}

	/** How long (in ms) an actual activity counts as "recent" for trait selection. */
	private static readonly ACTIVITY_WINDOW = 60_000;

	/**
	 * Puts a kitten with the given trait into the leader position, so that
	 * the upcoming action runs with the matching leader bonus. This is
	 * silent (no log messages), because it may run several times per tick.
	 * Only acts while the trait selection is in automatic mode; a trait
	 * elected manually by the player is never overridden here.
	 */
	swapLeaderFor(trait: Trait): void {
		const electLeader = this.settings.electLeader;
		if (!electLeader.enabled || electLeader.trait.selected !== "auto") {
			return;
		}
		// We can't assign a leader in the Anarchy challenge.
		if (this._host.game.challenges.isActive("anarchy")) {
			return;
		}

		const leader = this._host.game.village.leader;
		if (!isNil(leader) && leader.trait.name === trait) {
			return;
		}

		// Theocracy requires the leader to have a specific job.
		const theocracy = this._host.game.science.getPolicy("theocracy");
		const requiredJob = theocracy.researched
			? mustExist(theocracy.requiredLeaderJob)
			: null;

		const candidates = this._host.game.village.sim.kittens
			.filter(
				(kitten) =>
					kitten.trait.name === trait &&
					(requiredJob === null || kitten.job === requiredJob),
			)
			.sort((a, b) => b.rank - a.rank);
		if (candidates.length === 0) {
			return;
		}

		this._host.game.village.makeLeader(candidates[0]);
	}

	/**
	 * Determines the most suitable leader trait. Actual activity within the
	 * recent window always takes priority, so with multiple automations
	 * enabled the leader follows whatever is currently happening. When
	 * nothing happened recently, fall back to the enabled automations in
	 * fixed order:
	 * - Religion automation → `wise` (discounts on faith and gold prices)
	 * - Hunting automation → `manager` (hunting bonus)
	 * - Trading automation → `merchant` (trade bonus)
	 * - Crafting automation → `chemist`/`metallurgist`, depending on whether
	 *   chemical or metallic crafts are dominant, else `engineer` (general
	 *   crafting bonus).
	 */
	private _getDesiredLeaderTrait(): Trait {
		const now = Date.now();
		const recent: Array<{ trait: Trait; at: number }> = [
			{
				trait: "wise",
				at: this._host.engine.religionManager.lastFaithActionAt,
			},
			{ trait: "manager", at: this._lastHuntAt },
			{ trait: "merchant", at: this._host.engine.tradeManager.lastTradeAt },
		];
		const workshop = this._workshopManager;
		if (0 < workshop.lastCraftAt && workshop.lastCraftCategory !== null) {
			recent.push({
				trait:
					workshop.lastCraftCategory === "chemical"
						? "chemist"
						: workshop.lastCraftCategory === "metallic"
							? "metallurgist"
							: "engineer",
				at: workshop.lastCraftAt,
			});
		}
		const latest = recent
			.filter((_) => 0 < _.at && now - _.at < VillageManager.ACTIVITY_WINDOW)
			.sort((a, b) => b.at - a.at)[0];
		if (latest !== undefined) {
			return latest.trait;
		}

		// 静态瀑布（无近期活动时的默认归位）：
		// 锻造组（工匠/化学/冶金，按启用锻造的权重）> 商人 > 管理者 > 哲学家。
		// 挑战过滤：pacifism（和平主义）下打猎被禁，管理者加成毫无意义，直接跳过。
		const chemicalFocus = this._craftFocus(ChemicalCrafts);
		const metallicFocus = this._craftFocus(MetallicCrafts);
		if (0 < chemicalFocus || 0 < metallicFocus) {
			if (metallicFocus < chemicalFocus) {
				return "chemist";
			}
			if (chemicalFocus < metallicFocus) {
				return "metallurgist";
			}
			return "engineer";
		}
		if (this._host.engine.tradeManager.settings.enabled) {
			return "merchant";
		}
		if (
			this.settings.hunt.enabled &&
			!this._host.game.challenges.isActive("pacifism")
		) {
			return "manager";
		}
		if (this._host.engine.religionManager.settings.enabled) {
			return "wise";
		}
		return "engineer";
	}

	/**
	 * Sums the crafting activity for the given crafts. Enabled crafts count as
	 * 1, and crafts which are crafted without a limit count as 2, since they
	 * are a stronger signal of the player's current focus.
	 */
	private _craftFocus(crafts: ReadonlyArray<ResourceCraftable>): number {
		let focus = 0;
		for (const craft of crafts) {
			const setting = this._workshopManager.settings.resources[craft];
			if (!setting.enabled) {
				continue;
			}
			focus += setting.limited && 0 < setting.max ? 1 : 2;
		}
		return focus;
	}

	autoPromoteKittens(): void {
		const gold = this._workshopManager.getResource("gold");
		if (this.settings.promoteKittens.trigger < gold.value / gold.maxValue) {
			return;
		}

		for (
			let kittenIndex = 0;
			kittenIndex < this._host.game.village.sim.kittens.length;
			kittenIndex++
		) {
			let tier = -1;
			const engineerSpeciality =
				this._host.game.village.sim.kittens[kittenIndex].engineerSpeciality;
			// If this kitten has no engineer specialty, skip it.
			if (isNil(engineerSpeciality)) {
				continue;
			}

			// Check which rank would be ideal for their craft.
			tier = mustExist(
				this._host.game.workshop.getCraft(engineerSpeciality),
			).tier;
			// If the rank has already been reached, check next kitten.
			if (tier <= this._host.game.village.sim.kittens[kittenIndex].rank) {
				continue;
			}

			// We have found an engineer that isn't at their ideal rank.
			// No need to look further.
			this._host.game.village.promoteKittens();

			this._host.engine.iactivity("kittens.promote", "act.kittens.promote");
			this._host.engine.storeForSummary("kittens.promote", 1);
			return;
		}
	}

	autoPromoteLeader(): void {
		// If we have Civil Service unlocked and a leader elected.
		if (
			this._host.game.science.get("civil").researched &&
			this._host.game.village.leader !== null
		) {
			const leader = this._host.game.village.leader;
			const rank = leader.rank;
			const gold = this._workshopManager.getResource("gold");
			const goldStock = this._workshopManager.getStock("gold");

			// this._host.game.village.sim.goldToPromote will check gold
			// this._host.game.village.sim.promote check both gold and exp
			if (
				this._host.game.village.sim.goldToPromote(
					rank,
					rank + 1,
					gold.value - goldStock,
				)[0] &&
				this._host.game.village.sim.promote(leader, rank + 1) === 1
			) {
				this._host.engine.iactivity("leader.promote", "act.leader.promote", [
					rank + 1,
				]);
				this._host.game.villageTab.censusPanel?.census.renderGovernment(
					this._host.game.villageTab.censusPanel.census.container,
				);
				this._host.game.villageTab.censusPanel?.census.update();
				this._host.engine.storeForSummary("leader.promote", 1);
			}
		}
	}

	autoHunt() {
		const manpower = this._workshopManager.getResource("manpower");
		const trigger = this.settings.hunt.trigger;

		if (
			manpower.value < 100 ||
			trigger > manpower.value / manpower.maxValue ||
			this._host.game.challenges.isActive("pacifism")
		) {
			return;
		}

		// The manpower cost of a single hunt, accounting for any catpower discount.
		const manpowerCost =
			100 - this._host.game.getEffect("huntCatpowerDiscount");

		// Determine how many hunts are being performed, while respecting the
		// configured manpower reserve. `getValueAvailable` subtracts the reserve
		// (resource stock), so we never spend manpower below it.
		const manpowerAvailable =
			this._workshopManager.getValueAvailable("manpower");
		const huntCount = Math.floor(manpowerAvailable / manpowerCost);
		if (huntCount < 1) {
			return;
		}
		this.swapLeaderFor("manager");
		this._host.engine.storeForSummary("hunt", huntCount);

		const averageOutput = this._workshopManager.getAverageHunt();
		const trueOutput: Partial<Record<Resource, number>> = {};

		for (const [out, outValue] of objectEntries(averageOutput)) {
			const res = this._workshopManager.getResource(out);
			trueOutput[out] =
				// If this is a capped resource...
				0 < res.maxValue
					? // multiply the amount of times we hunted with the result of an average hunt.
						// Capping at the max value and 0 bounds.
						Math.min(
							outValue * huntCount,
							Math.max(res.maxValue - res.value, 0),
						)
					: // Otherwise, just multiply unbounded
						outValue * huntCount;
		}

		// Now actually perform the hunts. We can't use `village.huntAll`, as that
		// always spends *all* available manpower and ignores our reserve. Instead
		// we replicate its behavior (see the game's `huntFraction`) for a bounded
		// number of squads, leaving the configured reserve untouched.
		this._host.game.resPool.addResEvent("manpower", -huntCount * manpowerCost);
		this._host.game.village.gainHuntRes(huntCount);
		this._lastHuntAt = Date.now();
		this._host.engine.iactivity("hunt", "act.hunt", [
			this._host.renderAbsolute(huntCount),
		]);
	}

	autoFestival() {
		// If we haven't researched festivals yet, or still have more than 400 days left on one,
		// don't hold (another) one.
		if (
			!this._host.game.science.get("drama").researched ||
			400 < this._host.game.calendar.festivalDays
		) {
			return;
		}

		// If we don't have stacked festivals researched yet, and we still have days left on one,
		// don't hold one.
		if (
			!this._host.game.prestige.getPerk("carnivals").researched &&
			0 < this._host.game.calendar.festivalDays
		) {
			return;
		}

		// Check if we can afford a festival.
		const craftManager = this._workshopManager;
		if (
			craftManager.getValueAvailable("manpower") < 1500 ||
			craftManager.getValueAvailable("culture") < 5000 ||
			craftManager.getValueAvailable("parchment") < 2500
		) {
			return;
		}

		// Check if the festival would even be profitable for any resource
		// production. This only takes the resources the festival costs into
		// account, so it can be switched off to hold festivals for the sake of
		// the other resources a festival boosts.
		if (!this.settings.holdFestivals.ignoreProfitability.enabled) {
			const catpowProfitable =
				4000 *
					(craftManager.getTickVal(
						craftManager.getResource("manpower"),
					) as number) >
				1500;
			const cultureProfitable =
				4000 *
					(craftManager.getTickVal(
						craftManager.getResource("culture"),
					) as number) >
				5000;
			const parchProfitable =
				4000 *
					(craftManager.getTickVal(
						craftManager.getResource("parchment"),
					) as number) >
				2500;

			if (!catpowProfitable && !cultureProfitable && !parchProfitable) {
				return;
			}
		}

		const beforeDays = this._host.game.calendar.festivalDays;
		const controller = new classes.village.ui.FestivalButtonController(
			this._host.game,
		);
		const model = controller.fetchModel({
			controller,
			description: "",
			handler: () => {
				this._host.game.village.holdFestival(1);
			},
			name: "",
			prices: [
				{ name: "manpower" as const, val: 1500 },
				{ name: "culture" as const, val: 5000 },
				{ name: "parchment" as const, val: 2500 },
			],
		});
		// The game decides whether the festival can be afforded, so only report
		// what actually happened. The purchase is refused when the resources are
		// missing, when the game is read-only, and so on, and claiming a festival
		// that was never held is misleading.
		const result = controller.buyItem(model);
		if (result?.itemBought !== true) {
			return;
		}

		this._host.engine.storeForSummary("festival");
		if (beforeDays > 0) {
			this._host.engine.iactivity("festival", "festival.extend", []);
		} else {
			this._host.engine.iactivity("festival", "festival.hold", []);
		}
	}
}
