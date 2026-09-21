import type { SupportedLocale } from "../Engine.js";
import type { SettingOptions } from "../settings/Settings.js";
import type { TimeControlSettings } from "../settings/TimeControlSettings.js";
import type { TimeSkipHeatSettings } from "../settings/TimeSkipHeatSettings.js";
import type { TimeSkipSettings } from "../settings/TimeSkipSettings.js";
import { Cycles } from "../types/index.js";
import { Button } from "./components/Button.js";
import { CyclesList } from "./components/CyclesList.js";
import { Dialog } from "./components/Dialog.js";
import { LabelListItem } from "./components/LabelListItem.js";
import { SettingListItem } from "./components/SettingListItem.js";
import { SettingsList } from "./components/SettingsList.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { SettingTriggerListItem } from "./components/SettingTriggerListItem.js";
import type { UiComponent } from "./components/UiComponent.js";
import styles from "./TimeSkipHeatSettingsUi.module.css";

export class TimeSkipHeatSettingsUi extends SettingsPanel<
	TimeSkipHeatSettings,
	SettingTriggerListItem
> {
	constructor(
		parent: UiComponent,
		settings: TimeSkipHeatSettings,
		locale: SettingOptions<SupportedLocale>,
		sectionSetting: TimeSkipSettings,
		sectionParentSetting: TimeControlSettings,
	) {
		const label = parent.host.engine.i18n("option.time.activeHeatTransfer");
		super(
			parent,
			settings,
			new SettingTriggerListItem(parent, settings, locale, label, {
				onCheck: (_isBatchProcess?: boolean) => {
					parent.host.engine.imessage("status.auto.enable", [label]);
				},
				onSetTrigger: async () => {
					const value = await Dialog.prompt(
						parent,
						parent.host.engine.i18n("ui.trigger.activeHeatTransfer.prompt"),
						parent.host.engine.i18n(
							"ui.trigger.activeHeatTransfer.promptTitle",
							[
								parent.host.renderPercentage(
									settings.trigger,
									locale.selected,
									true,
								),
							],
						),
						parent.host.renderPercentage(settings.trigger),
						parent.host.engine.i18n(
							"ui.trigger.activeHeatTransfer.promptExplainer",
						),
					);

					if (value === undefined || value === "" || value.startsWith("-")) {
						return;
					}

					settings.trigger =
						parent.host.parsePercentage(value) ?? settings.trigger;
				},
				onUnCheck: (_isBatchProcess?: boolean) => {
					parent.host.engine.imessage("status.auto.disable", [label]);
					settings.activeHeatTransferStatus.enabled = false;
				},
			}),
			{
				onRefreshRequest: () => {
					this.settingItem.triggerButton.inactive = !settings.enabled;
					this.settingItem.triggerButton.ineffective =
						sectionParentSetting.enabled &&
						sectionSetting.enabled &&
						settings.enabled &&
						settings.trigger === -1;

					// S3: 同一周期同时勾选「跳年」与「主动散热」会静默不跳年（B 分支直接 return）。
					const cycleConflict = Cycles.some(
						(cycle) =>
							this.setting.cycles[cycle].enabled &&
							sectionSetting.cycles[cycle].enabled,
					);
					this.expando.ineffective =
						(sectionParentSetting.enabled &&
							sectionSetting.enabled &&
							settings.enabled &&
							!Object.values(settings.cycles).some((cycle) => cycle.enabled)) ||
						cycleConflict;
					this.head.element.attr(
						"title",
						cycleConflict
							? this.host.engine.i18n("ui.heatTransfer.cycleConflict")
							: "",
					);

					if (settings.activeHeatTransferStatus.enabled) {
						this.head.elementLabel.attr("data-ks-active-from", "◎");
						this.head.elementLabel.attr("data-ks-active-to", "◎");
						this.head.elementLabel.addClass(styles.active);
					} else {
						this.head.elementLabel.removeClass(styles.active);
					}
				},
			},
		);

		// S1: 第二个阈值 —— 开始主动散热的热度比例（startRatio）。
		const startRatioButton = new Button(
			this,
			this.host.renderPercentage(
				this.setting.startRatio,
				locale.selected,
				true,
			),
			null,
			{
				alignment: "right",
				border: false,
				title: this.host.engine.i18n(
					"ui.trigger.activeHeatTransfer.startPromptExplainer",
				),
				onClick: async () => {
					const value = await Dialog.prompt(
						this,
						this.host.engine.i18n("ui.trigger.activeHeatTransfer.startPrompt"),
						this.host.engine.i18n(
							"ui.trigger.activeHeatTransfer.startPromptTitle",
							[
								this.host.renderPercentage(
									this.setting.startRatio,
									locale.selected,
									true,
								),
							],
						),
						this.host.renderPercentage(
							this.setting.startRatio,
							locale.selected,
						),
						this.host.engine.i18n(
							"ui.trigger.activeHeatTransfer.startPromptExplainer",
						),
					);
					if (value === undefined || value === "" || value.startsWith("-")) {
						return;
					}
					this.setting.startRatio =
						this.host.parsePercentage(value) ?? this.setting.startRatio;
				},
				onRefresh: () => {
					startRatioButton.updateLabel(
						this.host.renderPercentage(
							this.setting.startRatio,
							locale.selected,
							true,
						),
					);
					startRatioButton.inactive = !this.setting.enabled;
				},
			},
		);
		const startRatioItem = new LabelListItem(
			this,
			this.host.engine.i18n("option.time.activeHeatTransfer.startRatio"),
		);
		startRatioItem.head.addChild(startRatioButton);

		this.addChildContent(
			new SettingsList(this, {
				hasDisableAll: false,
				hasEnableAll: false,
			}).addChildren([
				startRatioItem,
				new SettingListItem(
					this,
					this.setting.getTemporalFluxDuringCooldown,
					this.host.engine.i18n(
						"option.time.activeHeatTransfer.getTemporalFlux",
					),
				),
				new CyclesList(this, this.setting.cycles, {
					onCheckCycle: (label: string) => {
						this.host.engine.imessage("time.heatTransfer.cycle.enable", [
							label,
						]);
					},
					onUnCheckCycle: (label: string) => {
						this.host.engine.imessage("time.heatTransfer.cycle.disable", [
							label,
						]);
					},
				}),
			]),
		);
	}
}
