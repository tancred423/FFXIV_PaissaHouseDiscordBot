import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { ColorHelper } from "../utils/ColorHelper.ts";
import { BaseCommand } from "../types/BaseCommand.ts";

export class HelpCommand extends BaseCommand {
  readonly data = this.createHelpCommandBuilder();

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const helpEmpbed = this.createHelpEmbed();
    await interaction.reply({ embeds: [helpEmpbed] });
  }

  private createHelpCommandBuilder(): SlashCommandBuilder {
    return new SlashCommandBuilder()
      .setName("help")
      .setDescription("Get information about this bot and how to use it");
  }

  private createHelpEmbed(): EmbedBuilder {
    const deploymentHash = Deno.env.get("DEPLOYMENT_HASH");
    const embed = new EmbedBuilder()
      .setTitle("PaissaHouse")
      .setThumbnail("https://zhu.codes/assets/PaissaLogo.c38c9420.png")
      .setDescription(
        "An unofficial Discord bot developed by [Tancred](https://github.com/Tancred423) to display data from [PaissaDB](https://zhu.codes/paissa). It also provides links to the [GameTora Housing Plot Viewer](https://gametora.com/ffxiv/housing-plot-viewer). This Discord bot is NOT affiliated with either PaissaDB nor GameTora. I just really like their work.",
      )
      .setColor(ColorHelper.getEmbedColor())
      .addFields(
        {
          name: "PaissaDB",
          value:
            "PaissaDB is a tool developed by [Zhu](https://github.com/zhudotexe). It has a website that lists houses for sale in Final Fantasy XIV, and how many lottery bids are on each. It comes with the [PaissaHouse XIVLauncher plugin](https://github.com/zhudotexe/FFXIV_PaissaHouse) so everyone can contribute.",
          inline: false,
        },
      )
      .addFields(
        {
          name: "Is this bot safe to use?",
          value:
            "Yes. First of all, this Discord bot does not break the TOS of SquareEnix as it just reads data from the PaissaDB API and therefore does not interact with the game in any way.\n" +
            "Furthermore, this bot is [open source](https://github.com/Tancred423/FFXIV_PaissaHouseDiscordBot) and the GitHub code will be automatically deployed to the server so you can be sure that the code you see is the code that runs on the server.",
          inline: false,
        },
      )
      .addFields(
        {
          name: "/paissa [datacenter] [world]",
          value:
            "Use this command to display current houses for sale. You will have to pick the command for your datacenter and then choose your world. There are optional parameters to filter the results:\n" +
            "`/paissa [datacenter] [world] [district?] [size?] [lottery-phase?] [allowed-tenants?] [plot?] [ward?]`\n" +
            "The Discord slash command interface should guide you through this command with ease.",
          inline: false,
        },
      )
      .addFields(
        {
          name: "/announcement set [channel]",
          value:
            "Set a channel to receive automatic notifications when new housing lottery phase begin. Requires Manage Server permission.",
          inline: false,
        },
      )
      .addFields(
        {
          name: "/announcement remove",
          value:
            "Remove the announcement channel setting and stop receiving lottery notifications. Requires Manage Server permission.",
          inline: false,
        },
      )
      .addFields(
        {
          name: "/announcement view",
          value:
            "View the current announcement channel to verify your configuration. Requires Manage Server permission.",
          inline: false,
        },
      );

    if (deploymentHash) {
      embed.setFooter({
        text: `Deployment Hash: ${deploymentHash}`,
      });
    }

    return embed;
  }
}
