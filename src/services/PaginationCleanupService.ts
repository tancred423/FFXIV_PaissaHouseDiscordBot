import { Client } from "discord.js";
import { Cron } from "croner";
import { PaissaCommand } from "../commands/PaissaCommand.ts";
import { DatabaseService } from "./DatabaseService.ts";
import { Logger } from "../utils/Logger.ts";

export class PaginationCleanupService {
  private client: Client;
  private cleanupJob?: Cron;

  constructor(client: Client) {
    this.client = client;
  }

  async cleanupAndRestoreStates(): Promise<void> {
    Logger.info(
      "STARTUP",
      "Starting pagination state cleanup and restoration...",
    );
    await PaissaCommand.loadPaginationStatesFromDatabase(this.client);
  }

  startPeriodicCleanup(): void {
    this.cleanupJob = new Cron("0 0 * * *", async () => {
      try {
        Logger.info("CLEANUP", "Running scheduled pagination state cleanup...");
        const deletedCount = await DatabaseService
          .deleteExpiredPaginationStates();
        Logger.info(
          "CLEANUP",
          `Deleted ${deletedCount} expired pagination states from database`,
        );
      } catch (error: unknown) {
        Logger.error(
          "CLEANUP",
          "Failed to run scheduled pagination cleanup",
          error,
        );
      }
    });

    Logger.info(
      "STARTUP",
      "Pagination cleanup scheduled to run daily at midnight",
    );
  }

  stop(): void {
    if (this.cleanupJob) {
      this.cleanupJob.stop();
    }
  }
}
