import {
  ActionRowBuilder,
  APIEmbed,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  Client,
  ComponentType,
  EmbedBuilder,
  EmbedData,
  InteractionCollector,
  JSONEncodable,
  SlashCommandBuilder,
} from "discord.js";
import { ColorHelper } from "../utils/ColorHelper.ts";
import { WorldDataHelper } from "../utils/WorldDataHelper.ts";
import { PaissaApiService } from "../services/PaissaApiService.ts";
import { TextOutputBuilder } from "../utils/TextOutputBuilder.ts";
import { PlotWithDistrict } from "../types/PlotWithDistrict.ts";
import { Logger } from "../utils/Logger.ts";
import { PaginationState } from "../types/PaginationState.ts";
import { DatabaseService } from "../services/DatabaseService.ts";
import {
  DistrictId,
  HouseSize,
  LottoPhase,
  PurchaseSystem,
} from "../types/ApiEnums.ts";
import { PlotValidationService } from "../services/PlotValidationService.ts";
import { WorldDetail } from "../types/ApiTypes.ts";
import { BaseCommand } from "../types/BaseCommand.ts";
import { FilterPhase } from "../types/FilterPhase.ts";
import { PaissaDbUrlBuilder } from "../utils/PaissaDbUrlBuilder.ts";
import { LotteryPhaseHelper } from "../utils/LotteryPhaseHelper.ts";

const PLOTS_PER_PAGE = 9;
const PAGINATION_TIMEOUT_MILLIS = 7 * 24 * 60 * 60 * 1000;
const paginationStates = new Map<string, PaginationState>();
const activeCollectors = new Map<
  string,
  InteractionCollector<ButtonInteraction<CacheType>>
>();

export class PaissaCommand extends BaseCommand {
  readonly data = this.createPaissaCommandBuilder();

  static async loadPaginationStatesFromDatabase(client: Client): Promise<void> {
    try {
      const dbStates = await DatabaseService.getAllPaginationStates();
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

      for (const dbState of dbStates) {
        if (dbState.createdAt < oneWeekAgo) {
          await DatabaseService.deletePaginationState(dbState.stateId);

          try {
            const channel = await client.channels.fetch(dbState.channelId);
            if (channel && "messages" in channel) {
              const message = await channel.messages.fetch(dbState.messageId);
              if (message) {
                const embeds = message.embeds.map((embed) => {
                  const updatedEmbed = new EmbedBuilder(embed as EmbedData);
                  const footerText = embed.footer?.text || "";
                  if (!footerText.includes("expired")) {
                    updatedEmbed.setFooter({
                      text: footerText +
                        "\nPagination session expired. Run the command again to continue browsing.",
                    });
                  }
                  return updatedEmbed;
                });

                await message.edit({
                  embeds: embeds as JSONEncodable<APIEmbed>[],
                  components: [],
                });
              }
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : null;
            if (
              errorMessage !== "Unknown Message" &&
              errorMessage !== "Missing Access"
            ) {
              Logger.warn(
                "STARTUP",
                `Failed to update expired message ${dbState.messageId}`,
                error,
              );
            }
          }

          continue;
        }

        try {
          const worldDetail = JSON.parse(dbState.worldDetailJson);
          const state: PaginationState = {
            plots: [],
            currentPage: dbState.currentPage,
            totalPages: dbState.totalPages,
            worldDetail,
            worldId: dbState.worldId,
            districtId: dbState.districtId,
            sizeFilter: dbState.sizeFilter,
            lotteryPhaseFilter: dbState.lotteryPhaseFilter,
            allowedTenantsFilter: dbState.allowedTenantsFilter,
            plotFilter: dbState.plotFilter,
            wardFilter: dbState.wardFilter,
            lastRefreshed: dbState.lastRefreshed,
          };

          paginationStates.set(dbState.stateId, state);

          const channel = await client.channels.fetch(dbState.channelId);
          if (channel && "messages" in channel) {
            const message = await channel.messages.fetch(dbState.messageId);
            if (message) {
              const command = new PaissaCommand();
              const fakeInteraction = {
                user: { id: dbState.userId },
                channel,
                channelId: dbState.channelId,
                guildId: dbState.guildId,
                fetchReply: () => Promise.resolve(message),
              } as ChatInputCommandInteraction;

              command.setupPaginationCollector(
                fakeInteraction,
                dbState.stateId,
                dbState.messageId,
              );
            }
          }
        } catch (error: unknown) {
          Logger.warn(
            "STARTUP",
            `Failed to restore pagination state ${dbState.stateId}`,
            error,
          );
          await DatabaseService.deletePaginationState(dbState.stateId);
        }
      }

      Logger.info(
        "STARTUP",
        `Loaded ${paginationStates.size} pagination states from database`,
      );
    } catch (error: unknown) {
      Logger.error("STARTUP", "Failed to load pagination states", error);
    }
  }

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const {
      worldId,
      districtFilter,
      sizeFilter,
      lotteryPhaseFilter,
      allowedTenantsFilter,
      plotFilter,
      wardFilter,
    } = this.parseOptions(interaction);

    await interaction.deferReply();

    const now = Date.now();
    const worldDetail = await PaissaApiService.fetchWorldDetail(worldId);
    const { embed, hasPagination, totalPlots } = await this.createHousingEmbed(
      worldDetail,
      districtFilter,
      sizeFilter,
      lotteryPhaseFilter,
      allowedTenantsFilter,
      plotFilter,
      wardFilter,
      0,
      now,
    );

    if (!hasPagination) {
      const stateId = `${interaction.user.id}_${interaction.id}_${Date.now()}`;

      const state: PaginationState = {
        plots: [],
        currentPage: 0,
        totalPages: 1,
        worldDetail,
        worldId,
        districtId: districtFilter as number | null,
        sizeFilter,
        lotteryPhaseFilter,
        allowedTenantsFilter,
        plotFilter,
        wardFilter,
        lastRefreshed: now,
      };

      paginationStates.set(stateId, state);

      const refreshButton = this.createRefreshButton();
      const message = await interaction.editReply({
        embeds: [embed],
        components: [refreshButton],
      });

      await this.savePaginationStateToDb(
        stateId,
        interaction.user.id,
        interaction.channelId,
        message.id,
        interaction.guildId || null,
        state,
      );

      this.cleanupExpiredStates();
      this.setupPaginationCollector(interaction, stateId, message.id);
      return;
    }

    const stateId = `${interaction.user.id}_${interaction.id}_${Date.now()}`;
    const totalPages = Math.ceil(totalPlots / PLOTS_PER_PAGE);
    const filteredPlots = this.getFilteredPlots(
      worldDetail,
      districtFilter,
      sizeFilter,
      plotFilter,
      wardFilter,
    );

    const state: PaginationState = {
      plots: filteredPlots,
      currentPage: 0,
      totalPages,
      worldDetail,
      worldId,
      districtId: districtFilter as number | null,
      sizeFilter,
      lotteryPhaseFilter,
      allowedTenantsFilter,
      plotFilter,
      wardFilter,
      lastRefreshed: now,
    };

    paginationStates.set(stateId, state);

    const buttons = this.createPaginationButtons(0, totalPages);
    const message = await interaction.editReply({
      embeds: [embed],
      components: [buttons],
    });

    await this.savePaginationStateToDb(
      stateId,
      interaction.user.id,
      interaction.channelId,
      message.id,
      interaction.guildId || null,
      state,
    );

    this.cleanupExpiredStates();
    this.setupPaginationCollector(interaction, stateId, message.id);
  }

  private createPaissaCommandBuilder(): SlashCommandBuilder {
    const paissaBuilder = new SlashCommandBuilder()
      .setName("paissa")
      .setDescription(
        "Get detailed housing information for a specific district and world",
      );

    const datacenters = WorldDataHelper.getDatacenters();
    datacenters.forEach((datacenter) => {
      const worlds = WorldDataHelper.getWorldsByDatacenter(datacenter);

      paissaBuilder.addSubcommand((subcommand) =>
        subcommand
          .setName(datacenter.toLowerCase())
          .setDescription(
            `Get detailed housing information for ${datacenter} datacenter`,
          )
          .addStringOption((option) =>
            option
              .setName("world")
              .setDescription(`World in ${datacenter} datacenter`)
              .setRequired(true)
              .addChoices(...worlds.map((world) => ({
                name: world.name,
                value: world.id.toString(),
              })))
          )
          .addStringOption((option) =>
            option
              .setName("district")
              .setDescription(
                "District to get detailed housing information for",
              )
              .setRequired(false)
              .addChoices(
                { name: "Mist", value: DistrictId.MIST.toString() },
                {
                  name: "The Lavender Beds",
                  value: DistrictId.THE_LAVENDER_BEDS.toString(),
                },
                { name: "The Goblet", value: DistrictId.THE_GOBLET.toString() },
                { name: "Shirogane", value: DistrictId.SHIROGANE.toString() },
                { name: "Empyreum", value: DistrictId.EMPYREUM.toString() },
              )
          )
          .addStringOption((option) =>
            option
              .setName("size")
              .setDescription("Filter by plot size (optional)")
              .setRequired(false)
              .addChoices(
                { name: "Small", value: HouseSize.SMALL.toString() },
                { name: "Medium", value: HouseSize.MEDIUM.toString() },
                { name: "Large", value: HouseSize.LARGE.toString() },
              )
          )
          .addStringOption((option) =>
            option
              .setName("lottery-phase")
              .setDescription("Filter by lottery phase (optional)")
              .setRequired(false)
              .addChoices(
                {
                  name: "Accepting Entries",
                  value: LottoPhase.ENTRY.toString(),
                },
                { name: "Results", value: LottoPhase.RESULTS.toString() },
                {
                  name: "Unavailable",
                  value: LottoPhase.UNAVAILABLE.toString(),
                },
                { name: "FCFS", value: FilterPhase.FCFS.toString() },
                {
                  name: "Missing/Outdated",
                  value: FilterPhase.MISSING_OUTDATED.toString(),
                },
              )
          )
          .addStringOption((option) =>
            option
              .setName("allowed-tenants")
              .setDescription("Filter by allowed tenants (optional)")
              .setRequired(false)
              .addChoices(
                {
                  name: "Free Company",
                  value: PurchaseSystem.FREE_COMPANY.toString(),
                },
                {
                  name: "Individual",
                  value: PurchaseSystem.INDIVIDUAL.toString(),
                },
              )
          )
          .addIntegerOption((option) =>
            option
              .setName("plot")
              .setDescription(
                "Filter by plot (1-30). Includes subdivisions (e.g. 30 also shows 60)",
              )
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(30)
          )
          .addIntegerOption((option) =>
            option
              .setName("ward")
              .setDescription("Filter by exact ward number (1-30)")
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(30)
          )
      );
    });

    return paissaBuilder;
  }

  private parseOptions(interaction: ChatInputCommandInteraction): {
    worldId: number;
    districtFilter: number | null;
    sizeFilter: number | null;
    lotteryPhaseFilter: number | null;
    allowedTenantsFilter: number | null;
    plotFilter: number | null;
    wardFilter: number | null;
  } {
    const worldId = parseInt(interaction.options.getString("world")!);
    const districtIdString = interaction.options.getString("district");
    const districtFilter = districtIdString ? parseInt(districtIdString) : null;
    const sizeString = interaction.options.getString("size");
    const sizeFilter = sizeString ? parseInt(sizeString) : null;
    const lotteryPhaseString = interaction.options.getString("lottery-phase");
    const lotteryPhaseFilter = lotteryPhaseString
      ? parseInt(lotteryPhaseString)
      : null;
    const allowedTenantsString = interaction.options.getString(
      "allowed-tenants",
    );
    const allowedTenantsFilter = allowedTenantsString
      ? parseInt(allowedTenantsString)
      : null;
    const plotFilter = interaction.options.getInteger("plot");
    const wardFilter = interaction.options.getInteger("ward");

    return {
      worldId,
      districtFilter,
      sizeFilter,
      lotteryPhaseFilter,
      allowedTenantsFilter,
      plotFilter,
      wardFilter,
    };
  }

  private getFilteredPlots(
    worldDetail: WorldDetail,
    districtFilter: number | null = null,
    sizeFilter: number | null = null,
    plotFilter: number | null = null,
    wardFilter: number | null = null,
  ): PlotWithDistrict[] {
    const allPlots: PlotWithDistrict[] = worldDetail.districts.flatMap((
      district,
    ) =>
      district.open_plots.map((plot) => ({
        ...plot,
        districtId: district.id,
        districtName: district.name,
      }))
    );

    let filteredPlots = allPlots;
    if (districtFilter !== null) {
      filteredPlots = filteredPlots.filter((plot) =>
        plot.districtId === districtFilter
      );
    }
    if (sizeFilter !== null) {
      filteredPlots = filteredPlots.filter((plot) => plot.size === sizeFilter);
    }
    if (plotFilter !== null) {
      const apiPlotIndex = plotFilter - 1;
      const apiPlotIndexDuplicate = apiPlotIndex + 30;
      filteredPlots = filteredPlots.filter((plot) =>
        plot.plot_number === apiPlotIndex ||
        plot.plot_number === apiPlotIndexDuplicate
      );
    }
    if (wardFilter !== null) {
      const apiWardIndex = wardFilter - 1;
      filteredPlots = filteredPlots.filter((plot) =>
        plot.ward_number === apiWardIndex
      );
    }

    return filteredPlots;
  }

  private async createHousingEmbed(
    worldDetail: WorldDetail,
    districtFilter: number | null,
    sizeFilter: number | null,
    lotteryPhaseFilter: number | null,
    allowedTenantsFilter: number | null,
    plotFilter: number | null,
    wardFilter: number | null,
    page: number = 0,
    lastRefreshed?: number,
  ): Promise<
    { embed: EmbedBuilder; hasPagination: boolean; totalPlots: number }
  > {
    const allPlots: PlotWithDistrict[] = worldDetail.districts.flatMap((
      district,
    ) =>
      district.open_plots.map((plot) => ({
        ...plot,
        districtId: district.id,
        districtName: district.name,
      }))
    );

    let filteredPlots = allPlots;
    if (districtFilter !== null) {
      filteredPlots = filteredPlots.filter((plot) =>
        plot.districtId === districtFilter
      );
    }
    if (sizeFilter !== null) {
      filteredPlots = filteredPlots.filter((plot) => plot.size === sizeFilter);
    }
    if (plotFilter !== null) {
      const apiPlotIndex = plotFilter - 1;
      const apiPlotIndexDuplicate = apiPlotIndex + 30;
      filteredPlots = filteredPlots.filter((plot) =>
        plot.plot_number === apiPlotIndex ||
        plot.plot_number === apiPlotIndexDuplicate
      );
    }
    if (wardFilter !== null) {
      const apiWardIndex = wardFilter - 1;
      filteredPlots = filteredPlots.filter((plot) =>
        plot.ward_number === apiWardIndex
      );
    }
    if (lotteryPhaseFilter !== null) {
      filteredPlots = filteredPlots.filter((plot) => {
        if (!PlotValidationService.isLottery(plot)) {
          return lotteryPhaseFilter === FilterPhase.FCFS;
        }
        if (PlotValidationService.isUnknownOrOutdatedPhase(plot)) {
          return lotteryPhaseFilter === FilterPhase.MISSING_OUTDATED;
        }
        return plot.lotto_phase === lotteryPhaseFilter;
      });
    }
    if (allowedTenantsFilter !== null) {
      filteredPlots = filteredPlots.filter((plot) =>
        (plot.purchase_system & allowedTenantsFilter) !== 0
      );
    }

    const totalPlots = filteredPlots.length;
    const totalPages = Math.ceil(totalPlots / PLOTS_PER_PAGE);
    const hasPagination = totalPlots > PLOTS_PER_PAGE;
    const startIndex = page * PLOTS_PER_PAGE;
    const endIndex = Math.min(startIndex + PLOTS_PER_PAGE, totalPlots);
    const currentPlots = filteredPlots.slice(startIndex, endIndex);

    const title = `${worldDetail.name}`;

    const allPlotsOnWorld: PlotWithDistrict[] = worldDetail.districts.flatMap(
      (district) =>
        district.open_plots.map((plot) => ({
          ...plot,
          districtId: district.id,
          districtName: district.name,
        })),
    );
    const totalPlotsOnWorld = allPlotsOnWorld.length;
    const entryPhasePlots = allPlotsOnWorld.filter((plot) => {
      if (!PlotValidationService.isLottery(plot)) return false;
      if (PlotValidationService.isUnknownOrOutdatedPhase(plot)) return false;
      return plot.lotto_phase === LottoPhase.ENTRY;
    }).length;
    const missingDataPlots =
      allPlotsOnWorld.filter((plot) =>
        PlotValidationService.isUnknownOrOutdatedPhase(plot)
      ).length;
    const missingDataPlotsText = missingDataPlots > 0
      ? `, Missing/outdated data: ${missingDataPlots}`
      : "";

    let description =
      `Open plots: ${totalPlotsOnWorld} (Available: ${entryPhasePlots}${missingDataPlotsText})`;

    const currentOrLatestPhase = await LotteryPhaseHelper
      .getCurrentOrLatestLotteryPhase(worldDetail);
    if (!currentOrLatestPhase) {
      description += `\nLottery phase ends: Insufficient data`;
    } else if (currentOrLatestPhase.isCurrent) {
      const discordTimestamp = Math.floor(currentOrLatestPhase.until);
      description +=
        `\n${currentOrLatestPhase.phaseName} ends: <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`;
    } else {
      const discordTimestamp = Math.floor(currentOrLatestPhase.until);
      description +=
        `\n${currentOrLatestPhase.phaseName} ended: <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`;
    }

    const activeFilters: string[] = [];
    if (districtFilter !== null) {
      const district = worldDetail.districts.find((district) =>
        district.id === districtFilter
      );
      activeFilters.push(
        TextOutputBuilder.builDistrictWithEmoji(district?.name),
      );
    }
    if (sizeFilter !== null) {
      activeFilters.push(TextOutputBuilder.buildSizeWithEmoji(sizeFilter));
    }
    if (plotFilter !== null) {
      activeFilters.push(TextOutputBuilder.buildPlotWithEmoji(plotFilter));
    }
    if (wardFilter !== null) {
      activeFilters.push(TextOutputBuilder.buildWardWithEmoji(wardFilter));
    }
    if (lotteryPhaseFilter !== null) {
      activeFilters.push(
        TextOutputBuilder.buildLotteryPhaseWithEmoji(lotteryPhaseFilter),
      );
    }
    if (allowedTenantsFilter !== null) {
      activeFilters.push(
        TextOutputBuilder.buildAllowedTenantsWithEmoji(allowedTenantsFilter),
      );
    }

    if (totalPlots !== totalPlotsOnWorld) {
      const filteredPlotsText = totalPlots === 1 ? "plot" : "plots";
      if (activeFilters.length > 0) {
        description += `\n\nFiltered ${totalPlots} ${filteredPlotsText}: ${
          activeFilters.join(" • ")
        }`;
      } else {
        description += `\n\nFiltered ${totalPlots} ${filteredPlotsText}`;
      }
    }

    const paissaDbUrl = PaissaDbUrlBuilder.buildUrl(
      worldDetail.id,
      districtFilter,
      sizeFilter,
      lotteryPhaseFilter,
      allowedTenantsFilter,
      plotFilter,
      wardFilter,
    );

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setURL(paissaDbUrl)
      .setDescription(description)
      .setColor(ColorHelper.getEmbedColor());

    if (lastRefreshed) {
      embed.setTimestamp(lastRefreshed);
    }

    if (currentPlots.length > 0) {
      currentPlots.forEach((plot: PlotWithDistrict) => {
        embed.addFields({
          name: TextOutputBuilder.buildFieldName(plot),
          value: [
            TextOutputBuilder.builDistrictWithEmoji(plot.districtName),
            TextOutputBuilder.buildSizeWithEmoji(plot.size),
            TextOutputBuilder.buildPriceWithEmoji(plot.price),
            TextOutputBuilder.buildEntries(plot),
            TextOutputBuilder.buildLotteryPhaseWithEmojiByPlot(plot),
            TextOutputBuilder.buildAllowedTenantsWithEmoji(
              plot.purchase_system,
            ),
            TextOutputBuilder.buildLastUpdatedWithEmoji(plot),
            TextOutputBuilder.buildGameToraLinkWithEmoji(plot),
          ].join("\n"),
          inline: true,
        });
      });

      if (hasPagination) {
        const startPlot = startIndex + 1;
        const endPlot = endIndex;
        embed.setFooter({
          text: `Page ${
            page + 1
          }/${totalPages} • Showing plots ${startPlot}-${endPlot} of ${totalPlots} total`,
        });
      }
    }

    return { embed, hasPagination, totalPlots };
  }

  private createPaginationButtons(
    currentPage: number,
    totalPages: number,
  ): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    const jumpToStartButton = new ButtonBuilder()
      .setCustomId("pagination_jump_start")
      .setLabel("⏮️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 0);

    const prevButton = new ButtonBuilder()
      .setCustomId("pagination_prev")
      .setLabel("◀️ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 0);

    const refreshButton = new ButtonBuilder()
      .setCustomId("pagination_refresh")
      .setLabel("🔄 Refresh")
      .setStyle(ButtonStyle.Secondary);

    const nextButton = new ButtonBuilder()
      .setCustomId("pagination_next")
      .setLabel("Next ▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1);

    const jumpToEndButton = new ButtonBuilder()
      .setCustomId("pagination_jump_end")
      .setLabel("⏭️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1);

    row.addComponents(jumpToStartButton);
    row.addComponents(prevButton);
    row.addComponents(refreshButton);
    row.addComponents(nextButton);
    row.addComponents(jumpToEndButton);

    return row;
  }

  private createRefreshButton(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    const refreshButton = new ButtonBuilder()
      .setCustomId("pagination_refresh")
      .setLabel("🔄 Refresh")
      .setStyle(ButtonStyle.Secondary);

    row.addComponents(refreshButton);

    return row;
  }

  private async savePaginationStateToDb(
    stateId: string,
    userId: string,
    channelId: string,
    messageId: string,
    guildId: string | null,
    state: PaginationState,
  ): Promise<void> {
    try {
      await DatabaseService.savePaginationState({
        stateId,
        userId,
        channelId,
        messageId,
        guildId,
        worldId: state.worldId,
        districtId: state.districtId,
        sizeFilter: state.sizeFilter,
        lotteryPhaseFilter: state.lotteryPhaseFilter,
        allowedTenantsFilter: state.allowedTenantsFilter,
        plotFilter: state.plotFilter,
        wardFilter: state.wardFilter,
        currentPage: state.currentPage,
        totalPages: state.totalPages,
        worldDetailJson: JSON.stringify(state.worldDetail),
        createdAt: Date.now(),
        lastRefreshed: state.lastRefreshed,
      });
    } catch (error: unknown) {
      Logger.error(
        "COMMAND",
        "Failed to save pagination state to database",
        error,
      );
    }
  }

  private async updatePaginationStateInDb(
    stateId: string,
    state: PaginationState,
  ): Promise<void> {
    try {
      const dbState = await DatabaseService.getPaginationState(stateId);
      if (dbState) {
        await DatabaseService.savePaginationState({
          stateId,
          userId: dbState.userId,
          channelId: dbState.channelId,
          messageId: dbState.messageId,
          guildId: dbState.guildId,
          worldId: state.worldId,
          districtId: state.districtId,
          sizeFilter: state.sizeFilter,
          lotteryPhaseFilter: state.lotteryPhaseFilter,
          allowedTenantsFilter: state.allowedTenantsFilter,
          plotFilter: state.plotFilter,
          wardFilter: state.wardFilter,
          currentPage: state.currentPage,
          totalPages: state.totalPages,
          worldDetailJson: JSON.stringify(state.worldDetail),
          createdAt: dbState.createdAt,
          lastRefreshed: state.lastRefreshed,
        });
      }
    } catch (error: unknown) {
      Logger.error(
        "COMMAND",
        "Failed to update pagination state in database",
        error,
      );
    }
  }

  private cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [key] of paginationStates.entries()) {
      const stateTimestamp = parseInt(key.split("_").pop() || "0");
      if (now - stateTimestamp > PAGINATION_TIMEOUT_MILLIS) {
        paginationStates.delete(key);
        const collector = activeCollectors.get(key);
        if (collector) {
          collector.stop();
          activeCollectors.delete(key);
        }
      }
    }
  }

  private setupPaginationCollector(
    interaction: ChatInputCommandInteraction,
    stateId: string,
    messageId: string,
  ): void {
    const collector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: PAGINATION_TIMEOUT_MILLIS,
      filter: (i) => {
        return i.user.id === interaction.user.id && i.message.id === messageId;
      },
    });

    if (collector) {
      activeCollectors.set(stateId, collector);
    }

    collector?.on("collect", async (buttonInteraction) => {
      const state = paginationStates.get(stateId);
      if (!state) {
        await buttonInteraction.reply({
          content:
            "❌ Pagination session expired. Please run the command again.",
          ephemeral: true,
        });
        return;
      }

      if (buttonInteraction.customId === "pagination_refresh") {
        await buttonInteraction.deferUpdate();

        try {
          const freshWorldDetail = await PaissaApiService.fetchWorldDetail(
            state.worldId,
          );
          state.worldDetail = freshWorldDetail;
          state.lastRefreshed = Date.now();

          const filteredPlots = this.getFilteredPlots(
            freshWorldDetail,
            state.districtId,
            state.sizeFilter,
            state.plotFilter,
            state.wardFilter,
          );
          state.plots = filteredPlots;

          const { embed, hasPagination, totalPlots } = await this
            .createHousingEmbed(
              freshWorldDetail,
              state.districtId,
              state.sizeFilter,
              state.lotteryPhaseFilter,
              state.allowedTenantsFilter,
              state.plotFilter,
              state.wardFilter,
              state.currentPage,
              state.lastRefreshed,
            );

          const newTotalPages = Math.ceil(totalPlots / PLOTS_PER_PAGE);
          state.totalPages = newTotalPages;

          if (state.currentPage >= newTotalPages && newTotalPages > 0) {
            state.currentPage = newTotalPages - 1;
          }

          let components;
          if (hasPagination) {
            const buttons = this.createPaginationButtons(
              state.currentPage,
              state.totalPages,
            );
            components = [buttons];
          } else {
            const refreshButton = this.createRefreshButton();
            components = [refreshButton];
          }

          await buttonInteraction.editReply({
            embeds: [embed as JSONEncodable<APIEmbed>],
            components: components,
          });

          await this.updatePaginationStateInDb(stateId, state);
        } catch (error: unknown) {
          Logger.error("COMMAND", "Error refreshing data", error);
          await buttonInteraction.followUp({
            content: "❌ Failed to refresh data. Please try again later.",
            ephemeral: true,
          });
        }
        return;
      }

      let newPage = state.currentPage;

      switch (buttonInteraction.customId) {
        case "pagination_prev":
          newPage = Math.max(0, state.currentPage - 1);
          break;
        case "pagination_next":
          newPage = Math.min(state.totalPages - 1, state.currentPage + 1);
          break;
        case "pagination_jump_start":
          newPage = 0;
          break;
        case "pagination_jump_end":
          newPage = state.totalPages - 1;
          break;
      }

      if (newPage !== state.currentPage) {
        state.currentPage = newPage;
        const { embed } = await this.createHousingEmbed(
          state.worldDetail,
          state.districtId,
          state.sizeFilter,
          state.lotteryPhaseFilter,
          state.allowedTenantsFilter,
          state.plotFilter,
          state.wardFilter,
          newPage,
          state.lastRefreshed,
        );
        const buttons = this.createPaginationButtons(newPage, state.totalPages);

        try {
          await buttonInteraction.update({
            embeds: [embed as JSONEncodable<APIEmbed>],
            components: [buttons],
          });

          await this.updatePaginationStateInDb(stateId, state);
        } catch (error: unknown) {
          Logger.error("COMMAND", "Error updating pagination", error);
        }
      } else {
        await buttonInteraction.deferUpdate();
      }
    });

    collector?.on("end", async () => {
      paginationStates.delete(stateId);
      activeCollectors.delete(stateId);

      try {
        await DatabaseService.deletePaginationState(stateId);
      } catch (error: unknown) {
        Logger.error(
          "COMMAND",
          "Failed to delete pagination state from database",
          error,
        );
      }

      try {
        const message = await interaction.fetchReply();
        if (message && "edit" in message) {
          const embeds = message.embeds.map((embed) => {
            const updatedEmbed = new EmbedBuilder(embed as EmbedData);
            updatedEmbed.setFooter({
              text: embed.footer?.text +
                "\nPagination session expired. Run the command again to continue browsing.",
            });
            return updatedEmbed;
          });

          await message.edit({
            embeds: embeds as JSONEncodable<APIEmbed>[],
            components: [],
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : null;

        if (errorMessage === "Missing Access") {
          Logger.warn(
            "COMMAND",
            "Failed to remove pagination buttons: Missing Access",
          );
          return;
        }

        Logger.error("COMMAND", "Failed to remove pagination buttons", error);
      }
    });
  }
}
