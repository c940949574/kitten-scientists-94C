import { isNil, type Maybe } from "@oliversalzburg/js-utils/data/nil.js";
import { consumeEntriesPedantic } from "../tools/Entries.js";
import { Cycles } from "../types/index.js";
import { Setting, SettingTrigger } from "./Settings.js";
import type { CyclesSettings } from "./TimeSkipSettings.js";

export class TimeSkipHeatSettings extends SettingTrigger {
	readonly cycles: CyclesSettings;
	readonly activeHeatTransferStatus: Setting;
	/**
	 * 开始主动散热的热度阈值（占 heatMax 的比例）。
	 * 默认 0.99 精确复刻原硬编码魔数 `heatMax - heatPerTick * ticksPerSecond * 10`
	 * （heatPerTick=0.02、ticksPerSecond=5、heatMax=100 → 离满 1 点 = 99%）。
	 * 注意：`trigger` 是「停止」阈值，请勿改名，否则旧存档的偏好会静默丢失。
	 */
	startRatio = 0.99;
	/**
	 * 主动散热期间是否顺带燃烧时间水晶以攒时间通量（原 A 分支）。
	 * 默认开启以保持原有行为；关闭后只做纯散热/跳余下当前周期。
	 */
	readonly getTemporalFluxDuringCooldown: Setting;

	constructor(activeHeatTransferStatus = new Setting()) {
		super(false, 1);
		this.cycles = this.initCycles();
		this.activeHeatTransferStatus = activeHeatTransferStatus;
		this.getTemporalFluxDuringCooldown = new Setting(true);
	}

	private initCycles(): CyclesSettings {
		const items = {} as CyclesSettings;
		for (const item of Cycles) {
			items[item] = new Setting();
		}
		return items;
	}

	load(settings: Maybe<Partial<TimeSkipHeatSettings>>) {
		if (isNil(settings)) {
			return;
		}

		super.load(settings);

		consumeEntriesPedantic(this.cycles, settings.cycles, (cycle, item) => {
			cycle.enabled = item?.enabled ?? cycle.enabled;
		});
		this.activeHeatTransferStatus.load(settings.activeHeatTransferStatus);

		if (!isNil(settings.startRatio)) {
			this.startRatio = settings.startRatio;
		}
		if (!isNil(settings.getTemporalFluxDuringCooldown)) {
			this.getTemporalFluxDuringCooldown.load(
				settings.getTemporalFluxDuringCooldown,
			);
		}
	}
}
