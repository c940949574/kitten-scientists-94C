import { isNil, type Maybe } from "@oliversalzburg/js-utils/data/nil.js";
import { TimeSkipHeatSettings } from "../settings/TimeSkipHeatSettings.js";
import { consumeEntriesPedantic } from "../tools/Entries.js";
import { type Cycle, Cycles, type Season, Seasons } from "../types/index.js";
import {
	Setting,
	SettingThreshold,
	SettingThresholdMax,
	SettingTrigger,
} from "./Settings.js";

export type CyclesSettings = Record<Cycle, Setting>;
export type SeasonsSettings = Record<Season, Setting>;

/**
 * Settings for automatically burning time crystals to replenish temporal flux.
 *
 * The trigger is the level of temporal flux below which additional years are
 * skipped to refill it. It can be given either as a share of the maximum
 * temporal flux storage, in which case it is kept as a value between 0 and 1,
 * or as an absolute amount.
 */
export class AcquireTemporalFluxSettings extends SettingTrigger {
	/**
	 * Hold off on acquiring temporal flux until at least this many
	 * chronospheres are built.
	 *
	 * Chronospheres are what actually produce temporal flux, so once a player
	 * has crossed a certain number of them, burning time crystals to skip years
	 * becomes worthwhile. Below that threshold the acquisition is paused, which
	 * keeps it from spending crystals for a trickle of flux early on.
	 *
	 * The trigger holds the minimum number of standing chronospheres. It can't
	 * be a share of anything, so only an absolute count is accepted.
	 */
	readonly minimumChronospheres: SettingThreshold;

	/**
	 * Burn time crystals even while the stored heat has reached its maximum.
	 *
	 * Combusting time crystals while overheated costs a premium, so by default
	 * the acquisition waits for the heat to cool down before it burns any.
	 */
	readonly ignoreOverheat: Setting;

	constructor(
		enabled = false,
		trigger = 0.5,
		triggerIsPercentage?: boolean,
		ignoreOverheat = new Setting(),
		minimumChronospheres = new SettingThreshold(),
	) {
		super(enabled, trigger, triggerIsPercentage);
		this.ignoreOverheat = ignoreOverheat;
		this.minimumChronospheres = minimumChronospheres;
	}

	load(settings: Maybe<Partial<AcquireTemporalFluxSettings>>) {
		if (isNil(settings)) {
			return;
		}

		super.load(settings);
		this.ignoreOverheat.load(settings.ignoreOverheat);
		this.minimumChronospheres.load(settings.minimumChronospheres);
	}
}

export class TimeSkipSettings extends SettingThresholdMax {
	readonly cycles: CyclesSettings;
	readonly seasons: SeasonsSettings;
	readonly activeHeatTransfer: TimeSkipHeatSettings;
	readonly ignoreOverheat: Setting;

	/**
	 * Automatically burn time crystals, in order to replenish temporal flux.
	 *
	 * The trigger is the level of temporal flux below which additional years are
	 * skipped to refill it. It is either a share of the maximum temporal flux
	 * storage or an absolute amount.
	 *
	 * Skipping years only produces temporal flux if the `turnSmoothly` workshop
	 * upgrade (which makes chronospheres produce temporal flux) is researched.
	 *
	 * While the stored heat has reached its maximum, no crystals are burned,
	 * unless `acquireTemporalFlux.ignoreOverheat` is enabled.
	 */
	readonly acquireTemporalFlux: AcquireTemporalFluxSettings;

	constructor(
		ignoreOverheat = new Setting(),
		activeHeatTransfer = new TimeSkipHeatSettings(),
		acquireTemporalFlux = new AcquireTemporalFluxSettings(),
	) {
		super(false, 5);
		this.cycles = this.initCycles();
		this.seasons = this.initSeason();
		this.activeHeatTransfer = activeHeatTransfer;
		this.ignoreOverheat = ignoreOverheat;
		this.acquireTemporalFlux = acquireTemporalFlux;
	}

	private initCycles(): CyclesSettings {
		const items = {} as CyclesSettings;
		for (const item of Cycles) {
			items[item] = new Setting();
		}
		return items;
	}

	private initSeason(): SeasonsSettings {
		const items = {} as SeasonsSettings;
		for (const item of Seasons) {
			items[item] = new Setting();
		}
		return items;
	}

	load(settings: Maybe<Partial<TimeSkipSettings>>) {
		if (isNil(settings)) {
			return;
		}

		super.load(settings);

		consumeEntriesPedantic(this.cycles, settings.cycles, (cycle, item) => {
			cycle.enabled = item?.enabled ?? cycle.enabled;
		});
		consumeEntriesPedantic(this.seasons, settings.seasons, (season, item) => {
			season.enabled = item?.enabled ?? season.enabled;
		});
		this.ignoreOverheat.load(settings.ignoreOverheat);
		this.activeHeatTransfer.load(settings.activeHeatTransfer);
		this.acquireTemporalFlux.load(settings.acquireTemporalFlux);
	}
}
