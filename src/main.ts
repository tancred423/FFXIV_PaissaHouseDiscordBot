import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import { Cron } from "croner";
import { BaseCommand } from "./types/BaseCommand.ts";
import { DatabaseService } from "./services/DatabaseService.ts";
import { AnnouncementSchedulerService } from "./services/AnnouncementSchedulerService.ts";
import { Logger } from "./utils/Logger.ts";
import { PresenceService } from "./services/PresenceService.ts";
import { PaginationCleanupService } from "./services/PaginationCleanupService.ts";

config();

const logTimezone = Deno.env.get("LOG_TIMEZONE") || "UTC";
Logger.setTimezone(logTimezone);

Logger.info(
  "SYSTEM",
  `Deployment hash: ${Deno.env.get("DEPLOYMENT_HASH") || "development"}`,
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});
const commands = new Map<string, ReturnType<BaseCommand["toCommandObject"]>>();

async function loadCommands() {
  try {
    const commandDir = "./src/commands";
    const entries = Array.from(Deno.readDirSync(commandDir));

    for (const entry of entries) {
      if (!entry.isFile || !entry.name.endsWith(".ts")) {
        continue;
      }

      const fileName = entry.name;

      try {
        const commandModule = await import(`./commands/${fileName}`);
        const exportedClass = Object.values(commandModule).find(
          (exported) => typeof exported === "function" && exported.prototype,
        ) as new () => BaseCommand;

        if (!exportedClass) {
          Logger.warn("STARTUP", `No class found in ${fileName}`);
          continue;
        }

        const commandInstance = new exportedClass();
        const command = commandInstance.toCommandObject();

        if (!command || !("data" in command) || !("execute" in command)) {
          Logger.warn(
            "STARTUP",
            `The command at ${fileName} is missing a required "data" or "execute" property.`,
          );
          continue;
        }

        commands.set(command.data.name, command);
      } catch (error) {
        Logger.error("STARTUP", `Failed to load command ${fileName}`, error);
      }
    }
  } catch (error) {
    Logger.error("STARTUP", "Failed to read commands directory", error);
  }
}

client.once(Events.ClientReady, async () => {
  await loadCommands();
  Logger.info(
    "STARTUP",
    `Discord initialized successfully as ${client.user?.tag} with ${commands.size} commands`,
  );

  await DatabaseService.initialize();

  const paginationCleanup = new PaginationCleanupService(client);
  await paginationCleanup.cleanupAndRestoreStates();
  paginationCleanup.startPeriodicCleanup();

  const presenceService = new PresenceService(client);
  await presenceService.updatePresence();
  new Cron("0 * * * *", () => presenceService.updatePresence());

  Logger.info(
    "STARTUP",
    "Presence update scheduled to run at the top of each hour",
  );

  const scheduler = new AnnouncementSchedulerService(client);
  scheduler.start();
});

client.on(Events.GuildDelete, async (guild) => {
  const removed = await DatabaseService.removeAnnouncementChannel(guild.id);
  if (removed) {
    Logger.info(
      "CLEANUP",
      `Cleaned up announcement settings for guild ${guild.id} (${guild.name})`,
    );
  }
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.isDMBased() && channel.guildId) {
    const storedChannelId = await DatabaseService.getAnnouncementChannel(
      channel.guildId,
    );
    if (storedChannelId === channel.id) {
      await DatabaseService.removeAnnouncementChannel(channel.guildId);
      Logger.info(
        "CLEANUP",
        `Cleaned up announcement settings for deleted channel ${channel.id} in guild ${channel.guildId}`,
      );
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const command = commands.get(commandName);

  if (!command) {
    Logger.error("COMMAND", `No command matching ${commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    Logger.error("COMMAND", `Error handling command ${commandName}`, error);

    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error occurred";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: `❌ Error: ${errorMessage}`,
      });
      return;
    }

    await interaction.reply({
      content: `❌ Error: ${errorMessage}`,
      ephemeral: true,
    });
  }
});

const token = Deno.env.get("DISCORD_BOT_TOKEN");
if (!token) {
  Logger.error("STARTUP", "DISCORD_BOT_TOKEN environment variable is required");
  Deno.exit(1);
}

client.login(token);
