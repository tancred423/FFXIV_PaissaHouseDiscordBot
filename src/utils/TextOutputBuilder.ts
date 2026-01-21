import { PlotWithDistrict } from "../types/PlotWithDistrict.ts";
import { HouseSize, LottoPhase, PurchaseSystem } from "../types/ApiEnums.ts";
import { PlotValidationService } from "../services/PlotValidationService.ts";
import { GameToraUrlBuilder } from "./GameToraUrlBuilder.ts";
import { EmojiHelper } from "./EmojiHelper.ts";
import { EmojiName } from "../types/EmojiName.ts";
import { FilterPhase } from "../types/FilterPhase.ts";

export class TextOutputBuilder {
  static buildAllowedTenantsWithEmoji(purchaseSystem: number): string {
    if (
      (purchaseSystem &
        (PurchaseSystem.FREE_COMPANY | PurchaseSystem.INDIVIDUAL)) ==
        (PurchaseSystem.FREE_COMPANY | PurchaseSystem.INDIVIDUAL)
    ) {
      return EmojiHelper.get(EmojiName.EMOJI_ALLOWED_TENANTS_UNRESTRICTED) +
        " Unrestricted";
    }

    if (purchaseSystem & PurchaseSystem.FREE_COMPANY) {
      return EmojiHelper.get(EmojiName.EMOJI_ALLOWED_TENANTS_FREE_COMPANY) +
        " Free Company";
    }

    return EmojiHelper.get(EmojiName.EMOJI_ALLOWED_TENANTS_INDIVIDUAL) +
      " Individual";
  }

  static buildDistrict(districtName: string | null | undefined): string {
    return districtName || "Unknown District";
  }

  static builDistrictWithEmoji(
    districtName: string | null | undefined,
  ): string {
    return EmojiHelper.get(EmojiName.EMOJI_AETHERYTE) + " " +
      this.buildDistrict(districtName);
  }

  static buildEntries(plot: PlotWithDistrict): string {
    const emoji = EmojiHelper.get(EmojiName.EMOJI_ENTRIES) + " ";

    if (!PlotValidationService.isLottery(plot)) {
      return emoji + "N/A";
    }

    if (
      plot.lotto_phase === null || PlotValidationService.isOutdatedPhase(plot)
    ) {
      return emoji + "_Missing Pl. Data_";
    }

    return emoji + (plot.lotto_entries?.toString() ?? "0");
  }

  static buildFieldName(plot: PlotWithDistrict): string {
    return `Plot ${plot.plot_number + 1} (Ward ${plot.ward_number + 1})`;
  }

  static buildGameToraLinkWithEmoji(plot: PlotWithDistrict): string {
    const plotUrl = GameToraUrlBuilder.buildPlotUrl(
      plot.districtId,
      plot.plot_number + 1,
    );
    const emoji = EmojiHelper.get(EmojiName.EMOJI_GAMETORA);
    return `[${emoji} View plot](${plotUrl})`;
  }

  static buildLastUpdatedWithEmoji(plot: PlotWithDistrict): string {
    return EmojiHelper.get(EmojiName.EMOJI_LAST_UPDATED) +
      ` <t:${Math.floor(plot.last_updated_time)}:R>`;
  }

  static buildLotteryPhaseWithEmoji(phase: number | null | undefined): string {
    switch (phase) {
      case LottoPhase.ENTRY:
        return EmojiHelper.get(EmojiName.EMOJI_PHASE_ACCEPTING_ENTRIES) +
          " Accepting Entries";
      case LottoPhase.RESULTS:
        return EmojiHelper.get(EmojiName.EMOJI_PHASE_RESULTS) + " Results";
      case LottoPhase.UNAVAILABLE:
        return EmojiHelper.get(EmojiName.EMOJI_PHASE_UNAVAILABLE) +
          " Unavailable";
      case FilterPhase.FCFS:
        return EmojiHelper.get(EmojiName.EMOJI_FCFS) + " FCFS";
      case FilterPhase.MISSING_OUTDATED:
        return EmojiHelper.get(EmojiName.EMOJI_PHASE_MISSING_PLACARD_DATA) +
          " Missing/Outdated";
      default:
        return EmojiHelper.get(EmojiName.EMOJI_PHASE_MISSING_PLACARD_DATA) +
          ` Unknown (${phase})`;
    }
  }

  static buildLotteryPhaseWithEmojiByPlot(plot: PlotWithDistrict): string {
    if (!PlotValidationService.isLottery(plot)) {
      return this.buildLotteryPhaseWithEmoji(FilterPhase.FCFS);
    }

    if (
      plot.lotto_phase === null || PlotValidationService.isOutdatedPhase(plot)
    ) {
      return this.buildLotteryPhaseWithEmoji(FilterPhase.MISSING_OUTDATED);
    }

    return this.buildLotteryPhaseWithEmoji(plot.lotto_phase);
  }

  static buildPriceWithEmoji(price: number): string {
    return EmojiHelper.get(EmojiName.EMOJI_GIL) + " " +
      new Intl.NumberFormat("en-US").format(price);
  }

  static buildSizeWithEmoji(size: number): string {
    switch (size) {
      case HouseSize.SMALL:
        return EmojiHelper.get(EmojiName.EMOJI_SMALL) + " Small";
      case HouseSize.MEDIUM:
        return EmojiHelper.get(EmojiName.EMOJI_MEDIUM) + " Medium";
      case HouseSize.LARGE:
        return EmojiHelper.get(EmojiName.EMOJI_LARGE) + " Large";
      default:
        throw Error("Invalid size");
    }
  }

  static buildWardWithEmoji(ward: number): string {
    return EmojiHelper.get(EmojiName.EMOJI_WARD) + " Ward " + ward;
  }

  static buildPlotWithEmoji(plot: number): string {
    return EmojiHelper.get(EmojiName.EMOJI_PLOT) + " Plot " + plot + " / " +
      (plot + 30);
  }
}
