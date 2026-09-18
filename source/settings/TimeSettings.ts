import { isNil, type Maybe } from "@oliversalzburg/js-utils/data/nil.js";
import { consumeEntriesPedantic } from "../tools/Entries.js";
import {
	type ChronoForgeUpgrade,
	ChronoForgeUpgrades,
	TimeItemVariant,
	type VoidSpaceUpgrade,
	VoidSpaceUpgrades,
} from "../types/index.js";
import {
	Setting,
	SettingThreshold,
	SettingTrigger,
	SettingTriggerMax,
} from "./Settings.js";

/**
 * The upgrades on the Time tab that we have options for.
 */
export type TimeItem = Exclude<
	ChronoForgeUpgrade | VoidSpaceUpgrade,
	"usedCryochambers"
>;

export class TimeSettingsItem extends SettingTriggerMax {
	readonly #building: TimeItem;
	readonly #variant: TimeItemVariant;

	get building() {
		return this.#building;
	}
	get variant() {
		return this.#variant;
	}

	constructor(building: TimeItem, variant: TimeItemVariant, enabled = false) {
		super(enabled, -1, 0);
		this.#building = building;
		this.#variant = variant;
	}
}

export type TimeBuildingsSettings = Record<TimeItem, TimeSettingsItem>;

/**
 * Settings for the automatic repair of used cryochambers.
 *
 * Repairing a cryochamber costs temporal flux. The trigger of this setting is
 * the lower limit of temporal flux that has to remain after each repair. It can
 * be given either as an absolute amount or as a share of the maximum temporal
 * flux storage, in which case it is kept as a value between 0 and 1.
 *
 * A value of 0 (or less) disables the limit.
 */
export class FixCryochambersSettings extends SettingThreshold {
	/**
	 * Only repair cryochambers while temporal flux is actually being produced.
	 *
	 * Temporal flux is produced by chronospheres, and only after the
	 * `turnSmoothly` workshop upgrade has been researched. Without a source of
	 * temporal flux, repairs would permanently drain the flux that other
	 * features (like time acceleration) rely on.
	 */
	onlyWithFluxProduction: Setting;

	/**
	 * Build another cryochamber before repairing the broken ones.
	 *
	 * A new cryochamber is cheapest right after a reset, because its price only
	 * climbs with the number of chambers already standing, and a reset empties
	 * that count. Repairs work the other way around: every chamber brought back
	 * makes the next one dearer. So while broken chambers are still lying
	 * around, spending on a new one first is the cheaper way to grow.
	 *
	 * At most one chamber is built per reset. See
	 * `TimeManager.buildBeforeRepairing()` for how the building is capped by the
	 * number of chronospheres that can sustain it.
	 */
	buildBeforeRepair: Setting;

	constructor(
		enabled = false,
		threshold = 0,
		onlyWithFluxProduction = new Setting(false),
		buildBeforeRepair = new Setting(false),
		triggerIsPercentage?: boolean,
	) {
		super(enabled, threshold, triggerIsPercentage);
		this.onlyWithFluxProduction = onlyWithFluxProduction;
		this.buildBeforeRepair = buildBeforeRepair;
	}

	load(settings: Maybe<Partial<FixCryochambersSettings>>) {
		if (isNil(settings)) {
			return;
		}

		super.load(settings);
		this.onlyWithFluxProduction.load(settings.onlyWithFluxProduction);
		this.buildBeforeRepair.load(settings.buildBeforeRepair);
	}
}

export class TimeSettings extends SettingTrigger {
	buildings: TimeBuildingsSettings;

	/**
	 * Fix used cryochambers.
	 */
	fixCryochambers: FixCryochambersSettings;

	constructor(
		enabled = false,
		trigger = -1,
		fixCryochambers = new FixCryochambersSettings(false, 0),
	) {
		super(enabled, trigger);
		this.buildings = this.initBuildings();
		this.fixCryochambers = fixCryochambers;
	}

	private initBuildings(): TimeBuildingsSettings {
		const items = {} as TimeBuildingsSettings;
		for (const item of ChronoForgeUpgrades) {
			items[item] = new TimeSettingsItem(item, TimeItemVariant.Chronoforge);
		}
		for (const item of VoidSpaceUpgrades) {
			if (item === "usedCryochambers") {
				continue;
			}
			items[item] = new TimeSettingsItem(item, TimeItemVariant.VoidSpace);
		}
		return items;
	}

	load(settings: Maybe<Partial<TimeSettings>>) {
		if (isNil(settings)) {
			return;
		}

		super.load(settings);

		consumeEntriesPedantic(
			this.buildings,
			settings.buildings,
			(building, item) => {
				building.enabled = item?.enabled ?? building.enabled;
				building.max = item?.max ?? building.max;
				building.trigger = item?.trigger ?? building.trigger;
			},
		);

		this.fixCryochambers.load(settings.fixCryochambers);
	}
}
