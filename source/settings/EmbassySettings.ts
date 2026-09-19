import { isNil, type Maybe } from "@oliversalzburg/js-utils/data/nil.js";
import { consumeEntriesPedantic } from "../tools/Entries.js";
import { type Race, Races } from "../types/index.js";
import { SettingMax, SettingTrigger } from "./Settings.js";

export class EmbassySetting extends SettingMax {
	readonly #race: Race;

	get race() {
		return this.#race;
	}

	constructor(race: Race, enabled = false) {
		super(enabled);
		this.#race = race;
	}
}

export type EmbassyRaceSettings = Record<Race, SettingMax>;

export class EmbassySettings extends SettingTrigger {
	races: EmbassyRaceSettings;

	/**
	 * Caps each embassy purchase at spendable culture × this share.
	 *
	 * Embassy prices grow with a fixed ratio of 1.15, so a value of 0.13%
	 * keeps one automated cycle from consuming more than ~1% of the culture
	 * stock. Checked per unit, like the building price budget.
	 */
	readonly priceBudget = new SettingTrigger(true, 0.0013);

	constructor(enabled = false) {
		super(enabled);
		this.races = this.initRaces();
	}

	private initRaces(): EmbassyRaceSettings {
		const items = {} as EmbassyRaceSettings;
		for (const item of Races) {
			// Leviathans have no embassies.
			if (item === "leviathans") {
				continue;
			}
			items[item] = new EmbassySetting(item);
		}
		return items;
	}

	load(settings: Maybe<Partial<EmbassySettings>>) {
		if (isNil(settings)) {
			return;
		}

		super.load(settings);

		this.priceBudget.load(settings.priceBudget);

		consumeEntriesPedantic(this.races, settings.races, (race, item) => {
			race.enabled = item?.enabled ?? race.enabled;
			race.max = item?.max ?? race.max;
		});
	}
}
