import { isNil, type Maybe } from "@oliversalzburg/js-utils/data/nil.js";
import { consumeEntriesPedantic } from "../tools/Entries.js";
import type { GamePage } from "../types/game.js";
import { type SpaceBuilding, SpaceBuildings } from "../types/index.js";
import { MissionSettings } from "./MissionSettings.js";
import { SettingTrigger, SettingTriggerMax } from "./Settings.js";

export class SpaceBuildingSetting extends SettingTriggerMax {
	readonly #building: SpaceBuilding;

	get building() {
		return this.#building;
	}

	constructor(building: SpaceBuilding) {
		super(false, -1, 0);
		this.#building = building;
	}
}

export type SpaceBuildingSettings = Record<SpaceBuilding, SpaceBuildingSetting>;

export class SpaceSettings extends SettingTrigger {
	buildings: SpaceBuildingSettings;

	unlockMissions: MissionSettings;

	/**
	 * Don't build when the price of a single unit would eat more than this
	 * share of what we can currently spend. Same limiter as the bonfire
	 * section's; buildings in space have the same exploding price curves.
	 */
	priceBudget: SettingTrigger;

	constructor(
		enabled = false,
		trigger = -1,
		unlockMissions = new MissionSettings(),
		priceBudget = new SettingTrigger(),
	) {
		super(enabled, trigger);
		this.buildings = this.initBuildings();
		this.unlockMissions = unlockMissions;
		this.priceBudget = priceBudget;
	}

	private initBuildings(): SpaceBuildingSettings {
		const items = {} as SpaceBuildingSettings;
		for (const item of SpaceBuildings) {
			items[item] = new SpaceBuildingSetting(item);
		}
		return items;
	}

	static validateGame(game: GamePage, settings: SpaceSettings) {
		MissionSettings.validateGame(game, settings.unlockMissions);
	}

	load(settings: Maybe<Partial<SpaceSettings>>) {
		if (isNil(settings)) {
			return;
		}

		super.load(settings);

		this.priceBudget.load(settings.priceBudget);

		consumeEntriesPedantic(
			this.buildings,
			settings.buildings,
			(building, item) => {
				building.enabled = item?.enabled ?? building.enabled;
				building.max = item?.max ?? building.max;
				building.trigger = item?.trigger ?? building.trigger;
				building.priceBudget?.load(item?.priceBudget);
			},
		);

		this.unlockMissions.load(settings.unlockMissions);
	}
}
