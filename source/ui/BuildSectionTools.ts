import type { SupportedLocale } from "../Engine.js";
import { BulkPurchaseHelper } from "../helper/BulkPurchaseHelper.js";
import {
	budgetSpendShare,
	ChronospheresForGrowth,
	chronoGrowthRisk,
	chronoSafeSpendShare,
	chronoStasisShare,
	chronosphereCount,
	type PriceRatioData,
	recommendedPriceBudget,
} from "../helper/PriceBudget.js";
import type { KittenScientists } from "../KittenScientists.js";
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

export type ChronoWarning = {
	/** The share of the spendable stock one cycle can burn through. */
	share: number;
	/** The share of the stock the chronospheres carry over. */
	chrono: number;
	/**
	 * The share one cycle may spend while the run still ends up ahead.
	 * `undefined` when the stock shrinks no matter what, because fewer than
	 * `ChronospheresForGrowth` chronospheres are standing.
	 */
	allowance: number | undefined;
};

/**
 * Determine whether a price budget lets a single cycle eat into what the
 * chronospheres carry over into the next run.
 *
 * Chronospheres preserve `k` of what is left, so a cycle spending the share
 * `f` hands the next run `k * (1 - f)` of the stock. The run only comes out
 * ahead while that is above 100%, which caps the spend at `1 - 1/k`. Below 67
 * chronospheres `k` never exceeds 100% and every cycle shrinks the stock, so
 * the warning then reports that instead of an allowance.
 *
 * @param priceRatio The price modifier of the build in question.
 * @param spendsPreserved Whether the build pays for anything a chronosphere
 * would carry over. Builds that only cost crafted or luxury resources can't
 * dent the next run, and are never warned about.
 * @returns The warning, or `undefined` when none is warranted.
 */
const overChronoWarning = (
	host: KittenScientists,
	budget: number,
	priceRatio?: () => number | undefined,
	spendsPreserved?: () => boolean,
): ChronoWarning | undefined => {
	if (!priceRatio || !Number.isFinite(budget) || budget <= 0) {
		return undefined;
	}

	// Without a chronosphere there is nothing to carry over, and a build that
	// pays nothing the chronospheres preserve can't dent the next run either.
	if (spendsPreserved && !spendsPreserved()) {
		return undefined;
	}

	const ratio = priceRatio();
	if (ratio === undefined) {
		return undefined;
	}

	const share = budgetSpendShare(budget, ratio);
	if (share === undefined) {
		return undefined;
	}

	const chrono = chronoStasisShare(host);
	if (chrono <= 0) {
		return undefined;
	}

	const allowance = chronoSafeSpendShare(host);
	if (allowance === undefined) {
		return { allowance: undefined, chrono, share };
	}

	return share <= allowance ? undefined : { allowance, chrono, share };
};

/**
 * The tooltip line a chronosphere warning contributes.
 */
const chronoWarningLine = (
	host: KittenScientists,
	warning: ChronoWarning,
	locale?: SupportedLocale,
): string => {
	const percentage = (value: number) =>
		host.renderPercentage(value, locale, true);

	if (warning.allowance === undefined) {
		return `\n${host.engine.i18n("ui.trigger.priceBudget.noGrowth", [
			host.renderAbsolute(chronosphereCount(host)),
			percentage(warning.chrono),
			host.renderAbsolute(ChronospheresForGrowth),
		])}`;
	}

	return `\n${host.engine.i18n("ui.trigger.priceBudget.warning", [
		percentage(warning.share),
		host.renderAbsolute(chronosphereCount(host)),
		percentage(warning.chrono),
		percentage(warning.allowance),
	])}`;
};

/**
 * Ask the user whether to keep a price budget that outspends what the
 * chronospheres carry over.
 *
 * @returns Whether the budget should be kept. A `false` result means the
 * caller must restore the previously stored budget.
 */
const confirmChronoWarning = async (
	host: KittenScientists,
	parent: UiComponent,
	label: string,
	warning: ChronoWarning,
	locale?: SupportedLocale,
	details?: string,
): Promise<boolean> => {
	const percentage = (value: number) =>
		host.renderPercentage(value, locale, true);

	const message =
		warning.allowance === undefined
			? host.engine.i18n("warn.priceBudget.noGrowth", [
					label,
					host.renderAbsolute(chronosphereCount(host)),
					percentage(warning.chrono),
					host.renderAbsolute(ChronospheresForGrowth),
				])
			: host.engine.i18n("warn.priceBudget.overChrono", [
					label,
					percentage(warning.share),
					host.renderAbsolute(chronosphereCount(host)),
					percentage(warning.chrono),
					percentage(warning.allowance),
				]);

	const confirmed =
		(await Dialog.confirm(
			parent,
			message,
			host.engine.i18n("ui.trigger.priceBudget.confirmTitle"),
			host.engine.i18n("ui.trigger.priceBudget.confirmExplainer"),
		)) === "OK";

	if (confirmed) {
		// The player chose to keep an over-the-line budget: hold automated
		// builds for a few seconds and say so in the message log, so they
		// get a moment to pause automation or lower the budget. When we
		// know which resources blow the budget, name them.
		BulkPurchaseHelper.pauseBuilds(5);
		if (details) {
			host.engine.imessage("warn.priceBudget.cooldown.detail", [
				label,
				details,
			]);
		} else {
			host.engine.imessage("warn.priceBudget.cooldown", [label]);
		}
	}

	return confirmed;
};

/**
 * One tooltip/prompt line telling the player what to type into a price budget
 * field, derived from the standing chronospheres and the price ratio at hand.
 *
 * @returns The line, or an empty string when there is no recommendation —
 * including the "fewer than 67 chronospheres" case, where the regular
 * warning already covers the situation.
 */
const priceBudgetRecommendLine = (
	host: KittenScientists,
	priceRatio?: () => number | undefined,
): string => {
	const recommend = recommendedPriceBudget(host, priceRatio?.());
	if (!recommend) {
		return "";
	}

	return `\n${host.engine.i18n("ui.trigger.priceBudget.recommend", [
		host.renderAbsolute(recommend.chronos),
		host.renderPercentage(recommend.budget, undefined, true),
		host.renderPercentage(recommend.limit, undefined, true),
	])}`;
};

/**
 * The tooltip lines a section's price budget contributes: the budget itself
 * and, when the budget lets a cycle outspend the chronospheres, a warning.
 *
 * @returns The lines to append to a tooltip, or an empty string when the
 * budget is off.
 */
export const priceBudgetTitleSuffix = (
	host: KittenScientists,
	budget: SettingTrigger | undefined,
	priceRatio?: () => number | undefined,
	locale?: SupportedLocale,
	spendsPreserved?: () => boolean,
): string => {
	if (
		!budget ||
		!budget.enabled ||
		!Number.isFinite(budget.trigger) ||
		budget.trigger < 0
	) {
		return "";
	}

	let suffix = `\n${host.engine.i18n("ui.trigger.priceBudget.build.title", [
		host.renderPercentage(budget.trigger, locale, true),
	])}`;

	const warning = overChronoWarning(
		host,
		budget.trigger,
		priceRatio,
		spendsPreserved,
	);
	if (warning) {
		suffix += chronoWarningLine(host, warning, locale);
	}

	return suffix;
};

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
		priceRatio?: () => number | undefined,
		spendsPreserved?: () => boolean,
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
					explainer:
						host.engine.i18n("ui.trigger.priceBudget.explainer") +
						priceBudgetRecommendLine(host, priceRatio),
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

		const previousBudgetEnabled = priceBudget.enabled;
		const previousBudgetTrigger = priceBudget.trigger;

		const parsedBudget = host.parsePercentage(budgetValue);
		if (parsedBudget === null) {
			return true;
		}

		priceBudget.enabled = true;
		priceBudget.trigger = parsedBudget;

		const warning = overChronoWarning(
			host,
			parsedBudget,
			priceRatio,
			spendsPreserved,
		);
		if (
			warning &&
			!(await confirmChronoWarning(
				host,
				parent,
				label,
				warning,
				locale.selected,
			))
		) {
			priceBudget.enabled = previousBudgetEnabled;
			priceBudget.trigger = previousBudgetTrigger;
		}

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
		priceRatio?: () => number | undefined,
		spendsPreserved?: () => boolean,
		priceData?: () => PriceRatioData,
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
						explainer:
							parent.host.engine.i18n(
								"ui.trigger.priceBudget.build.explainer",
								[label],
							) + priceBudgetRecommendLine(parent.host, priceRatio),
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

			const previousBudgetEnabled = budgetSetting.enabled;
			const previousBudgetTrigger = budgetSetting.trigger;

			const parsedBudget = parent.host.parsePercentage(budgetValue);
			if (parsedBudget === null) {
				return;
			}

			budgetSetting.enabled = true;
			budgetSetting.trigger = parsedBudget;

			// Actual growth risk: honors the real stock, the per-unit budget
			// veto chain, and the build's max — not just the theoretical
			// budget × r ÷ (r − 1) ceiling, which grossly overestimates
			// consumption when stockpiles dwarf unit prices.
			const data = priceData?.();
			const maxRemaining =
				data && option.max >= 0 && typeof data.val === "number"
					? Math.max(0, option.max - data.val)
					: undefined;
			const warning = data
				? chronoGrowthRisk(parent.host, data, parsedBudget, maxRemaining)
				: overChronoWarning(
						parent.host,
						parsedBudget,
						priceRatio,
						spendsPreserved,
					);
			if (
				warning &&
				!(await confirmChronoWarning(
					parent.host,
					parent,
					label,
					warning,
					locale.selected,
				))
			) {
				budgetSetting.enabled = previousBudgetEnabled;
				budgetSetting.trigger = previousBudgetTrigger;
			}
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

						const warning = overChronoWarning(
							parent.host,
							budgetSetting.trigger,
							priceRatio,
							spendsPreserved,
						);
						if (warning) {
							triggerTitle += chronoWarningLine(
								parent.host,
								warning,
								locale.selected,
							);
						}
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
		priceRatio?: () => number | undefined,
		spendsPreserved?: () => boolean,
		priceData?: () => PriceRatioData,
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

				const budget = option.priceBudget;
				if (
					budget &&
					budget.enabled &&
					Number.isFinite(budget.trigger) &&
					0 <= budget.trigger
				) {
					triggerTitle += `\n${parent.host.engine.i18n(
						"ui.trigger.priceBudget.build.title",
						[
							parent.host.renderPercentage(
								budget.trigger,
								locale.selected,
								true,
							),
						],
					)}`;

					const warning = overChronoWarning(
						parent.host,
						budget.trigger,
						priceRatio,
						spendsPreserved,
					);
					if (warning) {
						triggerTitle += chronoWarningLine(
							parent.host,
							warning,
							locale.selected,
						);
					}
				}

				element.triggerButton.updateTitle(
					parent.host.engine.i18n("ui.trigger", [triggerTitle]),
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
							explainer:
								parent.host.engine.i18n(
									"ui.trigger.priceBudget.build.explainer",
									[label],
								) + priceBudgetRecommendLine(parent.host, priceRatio),
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

				const previousBudgetEnabled = budget.enabled;
				const previousBudgetTrigger = budget.trigger;

				const parsedBudget = parent.host.parsePercentage(budgetValue);
				if (parsedBudget === null) {
					return;
				}

				budget.enabled = true;
				budget.trigger = parsedBudget;

				// Actual growth risk, same as above: real stock, budget veto
				// chain, and the build's max.
				const data = priceData?.();
				const maxRemaining =
					data && option.max >= 0 && typeof data.val === "number"
						? Math.max(0, option.max - data.val)
						: undefined;
				const warning = data
					? chronoGrowthRisk(parent.host, data, parsedBudget, maxRemaining)
					: overChronoWarning(
							parent.host,
							parsedBudget,
							priceRatio,
							spendsPreserved,
						);
				if (
					warning &&
					!(await confirmChronoWarning(
						parent.host,
						parent,
						label,
						warning,
						locale.selected,
					))
				) {
					budget.enabled = previousBudgetEnabled;
					budget.trigger = previousBudgetTrigger;
				}

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
