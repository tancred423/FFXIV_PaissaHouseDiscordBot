export class PaissaDbUrlBuilder {
  static buildUrl(
    worldId: number,
    districtId: number | null,
    size: number | null,
    lotteryPhase: number | null,
    allowedTenants: number | null,
    plot: number | null,
    ward: number | null,
  ): string {
    let plotParam = "";
    if (plot !== null) {
      const apiPlotIndex = plot - 1;
      const apiPlotIndexDuplicate = apiPlotIndex + 30;
      plotParam = `&plots=${apiPlotIndex}&plots=${apiPlotIndexDuplicate}`;
    }

    let wardParam = "";
    if (ward !== null) {
      const apiWardIndex = ward - 1;
      wardParam = `&wards=${apiWardIndex}`;
    }

    return `https://zhu.codes/paissa?world=${worldId}` +
      (size !== null ? `&sizes=${size}` : "") +
      (districtId !== null ? `&districts=${districtId}` : "") +
      (lotteryPhase !== null ? `&phases=${lotteryPhase}` : "") +
      (allowedTenants !== null ? `&tenants=${allowedTenants}` : "") +
      plotParam +
      wardParam;
  }
}
