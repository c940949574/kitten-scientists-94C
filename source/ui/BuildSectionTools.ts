import type { SupportedLocale } from "../Engine.js";
import type {
	SettingOptions,
	SettingTrigger,
	SettingTriggerMax,
} from "../settings/Settings.js";
import { Dialog } from "./components/Dialog.js";
import {
	SettingMaxTriggerListItem,
	type SettingMaxTriggerListItemOptions,
} from "./components/SettingMaxTriggerListItem.js";
import {
	SettingTriggerListItem,
	type SettingTriggerListItemOptions,
} from "./components/SettingTriggerListItem.js";
import type { UiComponent } from "./components/UiComponent.js";

export const BuildSectionTools = {
	/**
	 * Prompt for a section's stock trigger and its price budget in one dialog.
	 *
	 * Returns whether the dialog was confirmed, so callers can decide whether
	 * to propagate the change.
	 */
	setSectionTrigger: async (
		parent: UiComponent,
		sectionSetting: SettingTrigger,
		priceBudget: SettingTrigger,
		label: string,
		locale: SettingOptions<SupportedLocale>,
	): Promise<boolean> => {
		const host = parent.host;
		const result = await Dialog.promptFields(
			parent,
			[
				{
					explainer: host.engine.i18n("ui.trigger.section.promptExplainer"),
					initialValue:
						sectionSetting.trigger !== -1
							? host.renderPercentage(sectionSetting.trigger)
							: "",
					text: host.engine.i18n("ui.trigger.prompt.percentage"),
				},
				{
					explainer: host.engine.i18n("ui.trigger.priceBudget.explainer"),
					initialValue:
						priceBudget.enabled && priceBudget.trigger !== -1
							? host.renderPercentage(priceBudget.trigger)
							: "",
					text: host.engine.i18n("ui.trigger.priceBudget.prompt", [label]),
				},
			],
			host.engine.i18n("ui.trigger.section.prompt", [
				label,
				sectionSetting.trigger !== -1
					? host.renderPercentage(sectionSetting.trigger, locale.selected, true)
					: host.engine.i18n("ui.infinity"),
			]),
		);

		if (!result) {
			return false;
		}

		const [triggerValue, budgetValue] = result;

		if (triggerValue === "" || triggerValue.startsWith("-")) {
			sectionSetting.trigger = -1;
		} else {
			sectionSetting.trigger =
				host.parsePercentage(triggerValue) ?? sectionSetting.trigger;
		}

		if (budgetValue === "" || budgetValue.startsWith("-")) {
			priceBudget.enabled = false;
			priceBudget.trigger = -1;
			return true;
		}

		const parsedBudget = host.parsePercentage(budgetValue);
		if (parsedBudget === null) {
			return true;
		}

		priceBudget.enabled = true;
		priceBudget.trigger = parsedBudget;
		return true;
	},

	getBuildOptionWithMax: (
		parent: UiComponent,
		option: SettingTriggerMax,
		locale: SettingOptions<SupportedLocale>,
		sectionSetting: SettingTrigger,
		label: string,
		sectionLabel: string,
		options?: Partial<SettingMaxTriggerListItemOptions>,
	) => {
		const onSetMax = async () => {
			const value = await Dialog.prompt(
				parent,
				parent.host.engine.i18n("ui.max.prompt.absolute"),
				parent.host.engine.i18n("ui.max.build.prompt", [
					label,
					parent.host.renderAbsolute(option.max, locale.selected),
				]),
				parent.host.renderAbsolute(option.max),
				parent.host.engine.i18n("ui.max.build.promptExplainer"),
			);

			if (value === undefined) {
				return;
			}

			if (value === "" || value.startsWith("-")) {
				option.max = -1;
				return;
			}

			if (value === "0") {
				option.enabled = false;
			}

			option.max = parent.host.parseAbsolute(value) ?? option.max;
		};

		// Purchased build options carry a price budget; options that aren't bought
		// with resources may not have one, and then the trigger prompt stays a
		// single field.
		const budgetSetting = option.priceBudget;

		const onSetTrigger = async () => {
			if (!budgetSetting) {
				const value = await Dialog.prompt(
					parent,
					parent.host.engine.i18n("ui.trigger.prompt.percentage"),
					parent.host.engine.i18n("ui.trigger.build.prompt", [
						label,
						option.trigger !== -1
							? parent.host.renderPercentage(
									option.trigger,
									locale.selected,
									true,
								)
							: parent.host.engine.i18n("ui.trigger.build.inherited"),
					]),
					option.trigger !== -1
						? parent.host.renderPercentage(option.trigger)
						: "",
					parent.host.engine.i18n("ui.trigger.build.promptExplainer"),
				);

				if (value === undefined) {
					return;
				}

				if (value === "" || value.startsWith("-")) {
					option.trigger = -1;
					return;
				}

				option.trigger = parent.host.parsePercentage(value) ?? option.trigger;
				return;
			}

			// Both limiters in one dialog: this option's stock trigger and its own
			// price budget, which overrides the section's budget.
			const result = await Dialog.promptFields(
				parent,
				[
					{
						explainer: parent.host.engine.i18n(
							"ui.trigger.build.promptExplainer",
						),
						initialValue:
							option.trigger !== -1
								? parent.host.renderPercentage(option.trigger)
								: "",
						text: parent.host.engine.i18n("ui.trigger.prompt.percentage"),
					},
					{
						explainer: parent.host.engine.i18n(
							"ui.trigger.priceBudget.build.explainer",
							[label],
						),
						initialValue:
							budgetSetting.enabled && budgetSetting.trigger !== -1
								? parent.host.renderPercentage(budgetSetting.trigger)
								: "",
						text: parent.host.engine.i18n(
							"ui.trigger.priceBudget.build.prompt",
							[label],
						),
					},
				],
				parent.host.engine.i18n("ui.trigger.build.prompt", [
					label,
					option.trigger !== -1
						? parent.host.renderPercentage(
								option.trigger,
								locale.selected,
								true,
							)
						: parent.host.engine.i18n("ui.trigger.build.inherited"),
				]),
			);

			if (!result) {
				return;
			}

			const [triggerValue, budgetValue] = result;

			if (triggerValue === "" || triggerValue.startsWith("-")) {
				option.trigger = -1;
			} else {
				option.trigger =
					parent.host.parsePercentage(triggerValue) ?? option.trigger;
			}

			if (budgetValue === "" || budgetValue.startsWith("-")) {
				budgetSetting.enabled = false;
				budgetSetting.trigger = -1;
				return;
			}

			const parsedBudget = parent.host.parsePercentage(budgetValue);
			if (parsedBudget === null) {
				return;
			}

			budgetSetting.enabled = true;
			budgetSetting.trigger = parsedBudget;
		};

		const element = new SettingMaxTriggerListItem(
			parent,
			option,
			locale,
			label,
			{
				delimiter: options?.delimiter,
				onCheck: async (isBatchProcess?: boolean) => {
					parent.host.engine.imessage("status.sub.enable", [label]);
					if (option.max === 0 && !isBatchProcess) {
						await onSetMax();
					}
					await options?.onCheck?.(isBatchProcess);
				},
				onRefreshMax: () => {
					element.maxButton.updateLabel(parent.host.renderAbsolute(option.max));
					element.maxButton.updateTitle(
						option.max < 0
							? parent.host.engine.i18n("ui.max.build.titleInfinite", [label])
							: option.max === 0
								? parent.host.engine.i18n("ui.max.build.titleZero", [label])
								: parent.host.engine.i18n("ui.max.build.title", [
										parent.host.renderAbsolute(option.max),
										label,
									]),
					);
				},
				onRefreshRequest: () => {
					element.maxButton.inactive = !option.enabled || option.max === -1;
					element.maxButton.ineffective =
						sectionSetting.enabled && option.enabled && option.max === 0;

					element.triggerButton.inactive =
						!option.enabled || option.trigger === -1;
					element.triggerButton.ineffective =
						sectionSetting.enabled &&
						option.enabled &&
						sectionSetting.trigger === -1 &&
						option.trigger === -1;
				},
				onRefreshTrigger: () => {
					let triggerTitle =
						option.trigger < 0
							? sectionSetting.trigger < 0
								? parent.host.engine.i18n("ui.trigger.build.blocked", [
										sectionLabel,
									])
								: `${parent.host.renderPercentage(sectionSetting.trigger, locale.selected, true)} (${parent.host.engine.i18n("ui.trigger.build.inherited")})`
							: parent.host.renderPercentage(
									option.trigger,
									locale.selected,
									true,
								);

					if (
						budgetSetting &&
						budgetSetting.enabled &&
						Number.isFinite(budgetSetting.trigger) &&
						0 <= budgetSetting.trigger
					) {
						triggerTitle += `\n${parent.host.engine.i18n(
							"ui.trigger.priceBudget.build.title",
							[
								parent.host.renderPercentage(
									budgetSetting.trigger,
									locale.selected,
									true,
								),
							],
						)}`;
					}

					element.triggerButton.updateTitle(
						parent.host.engine.i18n("ui.trigger", [triggerTitle]),
					);
				},
				onSetMax,
				onSetTrigger: async () => {
					await onSetTrigger();
					await options?.onSetTrigger?.call(this);
				},
				onUnCheck: (isBatchProcess?: boolean) => {
					parent.host.engine.imessage("status.sub.disable", [label]);
					options?.onUnCheck?.(isBatchProcess);
				},
				renderLabelTrigger: options?.renderLabelTrigger,
				title: options?.title,
				upgradeIndicator: options?.upgradeIndicator,
			},
		);
		return element;
	},
	getBuildOption: (
		parent: UiComponent,
		option: SettingTriggerMax,
		locale: SettingOptions<SupportedLocale>,
		sectionSetting: SettingTrigger,
		label: string,
		sectionLabel: string,
		options?: Partial<SettingTriggerListItemOptions>,
	) => {
		const element = new SettingTriggerListItem(parent, option, locale, label, {
			delimiter: options?.delimiter,
			onCheck: async (isBatchProcess?: boolean) => {
				parent.host.engine.imessage("status.sub.enable", [label]);
				await options?.onCheck?.(isBatchProcess);
			},
			onRefreshRequest: () => {
				element.triggerButton.inactive =
					!option.enabled || option.trigger === -1;
				element.triggerButton.ineffective =
					sectionSetting.enabled &&
					option.enabled &&
					sectionSetting.trigger === -1 &&
					option.trigger === -1;
			},
			onRefreshTrigger: () => {
				element.triggerButton.updateTitle(
					parent.host.engine.i18n("ui.trigger", [
						option.trigger < 0
							? sectionSetting.trigger < 0
								? parent.host.engine.i18n("ui.trigger.build.blocked", [
										sectionLabel,
									])
								: `${parent.host.renderPercentage(sectionSetting.trigger, locale.selected, true)} (${parent.host.engine.i18n("ui.trigger.build.inherited")})`
							: parent.host.renderPercentage(
									option.trigger,
									locale.selected,
									true,
								),
					]),
				);
			},
			onSetTrigger: async () => {
				const budget = option.priceBudget;

				if (!budget) {
					const value = await Dialog.prompt(
						parent,
						parent.host.engine.i18n("ui.trigger.prompt.percentage"),
						parent.host.engine.i18n("ui.trigger.build.prompt", [
							label,
							option.trigger !== -1
								? parent.host.renderPercentage(
										option.trigger,
										locale.selected,
										true,
									)
								: parent.host.engine.i18n("ui.trigger.build.inherited"),
						]),
						option.trigger !== -1
							? parent.host.renderPercentage(option.trigger)
							: "",
						parent.host.engine.i18n("ui.trigger.build.promptExplainer"),
					);

					if (value === undefined) {
						return;
					}

					if (value === "" || value.startsWith("-")) {
						option.trigger = -1;
						return;
					}

					option.trigger = parent.host.parsePercentage(value) ?? option.trigger;
					await options?.onSetTrigger?.call(this);
					return;
				}

				const result = await Dialog.promptFields(
					parent,
					[
						{
							explainer: parent.host.engine.i18n(
								"ui.trigger.build.promptExplainer",
							),
							initialValue:
								option.trigger !== -1
									? parent.host.renderPercentage(option.trigger)
									: "",
							text: parent.host.engine.i18n("ui.trigger.prompt.percentage"),
						},
						{
							explainer: parent.host.engine.i18n(
								"ui.trigger.priceBudget.build.explainer",
								[label],
							),
							initialValue:
								budget.enabled && budget.trigger !== -1
									? parent.host.renderPercentage(budget.trigger)
									: "",
							text: parent.host.engine.i18n(
								"ui.trigger.priceBudget.build.prompt",
								[label],
							),
						},
					],
					parent.host.engine.i18n("ui.trigger.build.prompt", [
						label,
						option.trigger !== -1
							? parent.host.renderPercentage(
									option.trigger,
									locale.selected,
									true,
								)
							: parent.host.engine.i18n("ui.trigger.build.inherited"),
					]),
				);

				if (!result) {
					return;
				}

				const [triggerValue, budgetValue] = result;

				if (triggerValue === "" || triggerValue.startsWith("-")) {
					option.trigger = -1;
				} else {
					option.trigger =
						parent.host.parsePercentage(triggerValue) ?? option.trigger;
				}

				if (budgetValue === "" || budgetValue.startsWith("-")) {
					budget.enabled = false;
					budget.trigger = -1;
					return;
				}

				const parsedBudget = parent.host.parsePercentage(budgetValue);
				if (parsedBudget === null) {
					return;
				}

				budget.enabled = true;
				budget.trigger = parsedBudget;
				await options?.onSetTrigger?.call(this);
			},
			onUnCheck: (isBatchProcess?: boolean) => {
				parent.host.engine.imessage("status.sub.disable", [label]);
				options?.onUnCheck?.(isBatchProcess);
			},
			renderLabelTrigger: options?.renderLabelTrigger,
			title: options?.title,
			upgradeIndicator: options?.upgradeIndicator,
		});
		return element;
	},
};
