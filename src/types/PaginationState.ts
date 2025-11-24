import { WorldDetail } from "./ApiTypes.ts";
import { PlotWithDistrict } from "./PlotWithDistrict.ts";

export interface PaginationState {
  plots: PlotWithDistrict[];
  currentPage: number;
  totalPages: number;
  worldDetail: WorldDetail;
  worldId: number;
  districtId: number | null;
  sizeFilter: number | null;
  lotteryPhaseFilter: number | null;
  allowedTenantsFilter: number | null;
}
