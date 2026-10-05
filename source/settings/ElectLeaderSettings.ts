import { isNil, type Maybe } from "@oliversalzburg/js-utils/data/nil.js";
import { type Job, Jobs, type Trait, Traits } from "../types/index.js";
import { Setting, SettingOptions } from "./Settings.js";

/**
 * The trait selection for leader elections. `auto` derives the desired trait
 * from the automations which are currently enabled.
 */
export type ElectLeaderTrait = Trait | "auto";

export class ElectLeaderSettings extends Setting {
	readonly job: SettingOptions<Job>;
	readonly trait: SettingOptions<ElectLeaderTrait>;

	constructor(
		enabled = false,
		job = new SettingOptions<Job>(
			"any",
			Jobs.map((item) => {
				return { label: "", value: item };
			}),
		),
		trait = new SettingOptions<ElectLeaderTrait>("auto", [
			{ label: "", value: "auto" },
			...Traits.map((item) => {
				return { label: "", value: item };
			}),
		]),
	) {
		super(enabled);
		this.job = job;
		this.trait = trait;
	}

	load(settings: Maybe<Partial<ElectLeaderSettings>>) {
		if (isNil(settings)) {
			return;
		}

		super.load(settings);

		this.job.load(settings.job);
		this.trait.load(settings.trait);
	}
}
