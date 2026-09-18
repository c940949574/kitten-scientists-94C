import { mustExist } from "@oliversalzburg/js-utils/data/nil.js";
import type { FrameContext } from "./Engine.js";
import {
	BulkPurchaseHelper,
	type ConcreteBuild,
} from "./helper/BulkPurchaseHelper.js";
import type { KittenScientists } from "./KittenScientists.js";
import {
	type TimeItem,
	TimeSettings,
	type TimeSettingsItem,
} from "./settings/TimeSettings.js";
import { cl } from "./tools/Log.js";
import { resolveLimit } from "./tools/TriggerValue.js";
import {
	type ChronoForgeUpgrade,
	TimeItemVariant,
	type VoidSpaceUpgrade,
} from "./types/index.js";
import type {
	ChronoforgeBtnController,
	UnsafeChronoForgeUpgrade,
	UnsafeVoidSpaceUpgrade,
	VoidSpaceBtnController,
} from "./types/time.js";
import type { WorkshopManager } from "./WorkshopManager.js";

/**
 * Is temporal flux currently being produced?
 *
 * Chronospheres only produce temporal flux after the `turnSmoothly` workshop
 * upgrade has been researched. Without that upgrade, or without at least one
 * chronosphere, the production rate is 0.
 *
 * This mirrors the condition `TimeControlManager.getTemporalFluxSkips()` uses
 * to decide whether burning time crystals actually yields temporal flux.
 */
export function isTemporalFluxProduced(host: KittenScientists) {
	if (!host.game.workshop.get("turnSmoothly").researched) {
		return false;
	}

	return 0 < host.game.getEffect("temporalFluxProduction");
}

export class TimeManager {
	private readonly _host: KittenScientists;
	readonly settings: TimeSettings;
	private readonly _bulkManager: BulkPurchaseHelper;
	private readonly _workshopManager: WorkshopManager;

	/**
	 * How many broken cryochambers were seen on the previous observation.
	 *
	 * `null` until the first observation has been made.
	 */
	private _observedBrokenCryochambers: number | null = null;

	/**
	 * Is the one chamber that may be built per reset still unspent?
	 *
	 * This is deliberately not part of the settings: it is a reading of where in
	 * the reset cycle we are, not something the player configures.
	 */
	private _supplementUnspent = false;

	constructor(
		host: KittenScientists,
		workshopManager: WorkshopManager,
		settings = new TimeSettings(),
	) {
		this._host = host;
		this.settings = settings;
		this._bulkManager = new BulkPurchaseHelper(this._host, workshopManager);
		this._workshopManager = workshopManager;
	}

	tick(context: FrameContext) {
		if (!this.settings.enabled) {
			return;
		}

		this._bulkManager.resetPriceCache();
		this.autoBuild(context);

		if (this.settings.fixCryochambers.enabled) {
			this.fixCryochambers();
		}
	}

	/**
	 * Try to build as many of the passed buildings as possible.
	 * Usually, this is called at each iteration of the automation engine to
	 * handle the building of items on the Time tab.
	 *
	 * @param builds The buildings to build.
	 */
	autoBuild(
		context: FrameContext,
		builds: Partial<Record<TimeItem, TimeSettingsItem>> = this.settings
			.buildings,
	) {
		const sectionTrigger = this.settings.trigger;

		// Get the current metadata for all the referenced buildings.
		const metaData: Partial<
			Record<
				TimeItem,
				Required<UnsafeChronoForgeUpgrade | UnsafeVoidSpaceUpgrade>
			>
		> = {};
		for (const build of Object.values(builds)) {
			if (build.enabled === false) {
				continue;
			}

			const buildMeta =
				build.variant === TimeItemVariant.Chronoforge
					? this._host.game.time.getCFU(build.building as ChronoForgeUpgrade)
					: this._host.game.time.getVSU(build.building as VoidSpaceUpgrade);
			metaData[build.building] = mustExist(buildMeta);

			const buildButton =
				build.variant === TimeItemVariant.Chronoforge
					? this._host.game.time.queue.getQueueElementControllerAndModel({
							name: build.building,
							type: "chronoforge",
						})
					: this._host.game.time.queue.getQueueElementControllerAndModel({
							name: build.building,
							type: "voidSpace",
						});

			const panelVisible =
				build.variant === TimeItemVariant.Chronoforge
					? this._host.game.workshop.get("chronoforge").researched
					: this._host.game.science.get("voidSpace").researched ||
						this._host.game.time.getVSU("usedCryochambers").val > 0;

			const model = buildButton.model;
			const buildingMetaData = mustExist(metaData[build.building]);
			buildingMetaData.tHidden = !model.metadata.unlocked || !panelVisible;
		}

		const builder = (build: ConcreteBuild) => {
			this.build(
				build.id as ChronoForgeUpgrade | VoidSpaceUpgrade,
				build.variant as TimeItemVariant,
				build.count,
			);
		};
		context.purchaseOrders.push({ builder, builds, metaData, sectionTrigger });
	}

	build(
		name: ChronoForgeUpgrade | VoidSpaceUpgrade,
		variant: TimeItemVariant,
		amount: number,
	): void {
		let amountConstructed = 0;
		let label: string;
		if (variant === TimeItemVariant.Chronoforge) {
			const itemMetaRaw = game.getUnlockByName(name, "chronoforge");
			const controller = new classes.ui.time.ChronoforgeBtnController(
				this._host.game,
			) as ChronoforgeBtnController;
			const model = controller.fetchModel({ controller, id: itemMetaRaw.name });
			amountConstructed = this._bulkManager.construct(
				model,
				controller,
				amount,
			);
			label = itemMetaRaw.label;
		} else {
			const itemMetaRaw = game.getUnlockByName(name, "voidSpace");
			const controller = new classes.ui.time.VoidSpaceBtnController(
				this._host.game,
			) as VoidSpaceBtnController;
			const model = controller.fetchModel({ controller, id: itemMetaRaw.name });
			amountConstructed = this._bulkManager.construct(
				model,
				controller,
				amount,
			);
			label = itemMetaRaw.label;
		}

		if (amount !== amountConstructed) {
			console.warn(
				...cl(
					`${label} Amount ordered: ${amount} Amount Constructed: ${amountConstructed}`,
				),
			);
			// Bail out to not flood the log with garbage.
			if (amountConstructed === 0) {
				return;
			}
		}
		this._host.engine.storeForSummary("build.time", amountConstructed, label);

		if (amountConstructed === 1) {
			this._host.engine.iactivity("build.time", "act.build", [label]);
		} else {
			this._host.engine.iactivity("build.time", "act.builds", [
				label,
				this._host.renderAbsolute(amountConstructed),
			]);
		}
	}

	getBuild(
		name: ChronoForgeUpgrade | VoidSpaceUpgrade,
		variant: TimeItemVariant,
	) {
		if (variant === TimeItemVariant.Chronoforge) {
			return this._host.game.time.getCFU(name as ChronoForgeUpgrade);
		}
		return this._host.game.time.getVSU(name as VoidSpaceUpgrade);
	}

	/**
	 * Watch how many cryochambers are broken, so that a reset gets noticed.
	 *
	 * This runs on every frame that this automation is switched on, including
	 * the ones that never get as far as repairing anything. A reset is only ever
	 * recognised by watching the number climb, and a frame that returned early
	 * is exactly the frame a reset lands on: the chambers only become broken
	 * once the reset has happened.
	 */
	private observeBrokenCryochambers() {
		const broken = this._host.game.time.getVSU("usedCryochambers").val;

		if (this._observedBrokenCryochambers === null) {
			// First observation after load. The save may already have been reloaded
			// *post-reset*, in which case the broken chambers were never seen climb
			// from a smaller number and the rising-edge test below would never fire —
			// the supplement would be lost forever. So if there are already broken
			// chambers on the first frame, treat that as a reset we owe a chamber for.
			this._supplementUnspent = broken > 0;
		} else if (this._observedBrokenCryochambers < broken) {
			// A reset (or any break that raises the count) hands out another chamber.
			this._supplementUnspent = true;
		}

		this._observedBrokenCryochambers = broken;
	}

	/**
	 * Would the game let us build another cryochamber right now?
	 *
	 * @returns `true` if the build is unlocked and we can pay for it.
	 */
	private canBuildCryochamber(): boolean {
		const controller = new classes.ui.time.VoidSpaceBtnController(
			this._host.game,
		) as VoidSpaceBtnController;
		const model = controller.fetchModel({
			controller,
			id: this._host.game.getUnlockByName("cryochambers", "voidSpace").name,
		});

		return Boolean(model.enabled) && controller.hasResources(model);
	}

	/**
	 * Build a single additional cryochamber before the repairs start.
	 *
	 * Right after a reset this is the cheaper way to end up with more chambers:
	 * the price of a new one only climbs with the number of chambers already
	 * standing, which a reset empties, while every repair makes the next repair
	 * dearer. So building one while broken chambers are still lying around buys
	 * more than repairing one does.
	 *
	 * Only one chamber is built per reset, which `observeBrokenCryochambers()`
	 * keeps track of.
	 */
	buildBeforeRepairing() {
		if (!this.settings.fixCryochambers.buildBeforeRepair.enabled) {
			return;
		}

		if (!this._supplementUnspent) {
			return;
		}

		const broken = this._host.game.time.getVSU("usedCryochambers").val;

		// Every standing cryochamber needs a chronosphere to sustain it, and a
		// broken one comes back as a standing one once it is repaired. So while
		// the broken ones alone already cover every slot there is, repairing them
		// is all that is needed and another chamber would only sit unused.
		const supportedCryochambers =
			this._host.game.bld.getBuildingExt("chronosphere").meta.val;
		if (supportedCryochambers <= broken) {
			return;
		}

		// Only spend the chamber once it can actually be paid for. Coming back on
		// a later frame keeps the supplement available, instead of dropping it on
		// a purchase the game would refuse.
		if (!this.canBuildCryochamber()) {
			return;
		}

		this.build("cryochambers", TimeItemVariant.VoidSpace, 1);
		this._supplementUnspent = false;
	}

	fixCryochambers() {
		// Keep watching the broken chambers on every frame, including the ones
		// that bail out below. A reset is only ever noticed by watching the
		// number rise, and the frames that have nothing to repair are the ones a
		// reset lands on.
		this.observeBrokenCryochambers();

		// Optionally require an active source of temporal flux before repairing:
		// without one, every repair would drain flux that never comes back.
		if (
			this.settings.fixCryochambers.onlyWithFluxProduction.enabled &&
			!isTemporalFluxProduced(this._host)
		) {
			return;
		}

		if (this._host.game.time.getVSU("usedCryochambers").val < 1) {
			return;
		}

		this.buildBeforeRepairing();

		const prices = mustExist(
			this._host.game.time.getVSU("usedCryochambers").fixPrices,
		);

		// Repairing a cryochamber costs temporal flux. The configured lower limit is
		// the amount of temporal flux that has to *remain* after a repair, so that
		// repairs never drain the flux that other features (like time acceleration)
		// rely on. It is either an absolute amount or a share of the maximum
		// temporal flux storage. A value of 0 (or less) means "don't limit repairs
		// at all".
		//
		// Resolving the limit once is enough, because neither trigger nor maximum
		// moves while this runs. What has to be checked for every single repair is
		// the flux that is still left, which `staysAboveLimit` below reads afresh;
		// deciding that once before the loop would let a run of repairs spend far
		// below the limit.
		const minimumTemporalFlux = resolveLimit(
			this.settings.fixCryochambers.trigger,
			this.settings.fixCryochambers.isPercentage,
			this._host.game.resPool.get("temporalFlux").maxValue,
		);
		const temporalFluxPrice = prices
			.filter((price) => "temporalFlux" === price.name)
			.reduce((total, price) => total + price.val, 0);

		const staysAboveLimit = () =>
			minimumTemporalFlux <= 0 ||
			minimumTemporalFlux <=
				this._workshopManager.getValueAvailable("temporalFlux") -
					temporalFluxPrice;

		const canAfford = () =>
			prices.every(
				(price) =>
					price.val <= this._workshopManager.getValueAvailable(price.name),
			);

		const controller = new classes.ui.time.FixCryochamberBtnController(
			this._host.game,
		);
		const model = controller.fetchModel({});

		let fixed = 0;
		while (staysAboveLimit() && canAfford()) {
			const buyResult = controller.buyItem(model);
			if (!buyResult.itemBought) {
				break;
			}

			fixed += 1;
		}

		if (0 < fixed) {
			this._host.engine.iactivity(
				"time.fixCryochamber",
				"act.time.fixCryochamber",
				[this._host.renderAbsolute(fixed)],
			);
			this._host.engine.storeForSummary("time.fixCryochamber", fixed);
		}
	}
}
