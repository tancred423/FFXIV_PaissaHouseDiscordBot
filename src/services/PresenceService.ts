import { ActivityType, Client } from "discord.js";
import { Logger } from "../utils/Logger.ts";
import { LotteryPhase } from "../types/LotteryPhase.ts";
import { LotteryPhaseHelper } from "../utils/LotteryPhaseHelper.ts";

export class PresenceService {
  client: Client;
  defaultPresenceText: string = "/help, /paissa, /announcement";

  constructor(client: Client) {
    this.client = client;
  }

  async updatePresence(): Promise<void> {
    try {
      const currentOrLatestPhase = await LotteryPhaseHelper
        .getCurrentOrLatestLotteryPhase();

      if (!currentOrLatestPhase) {
        this.setDefaultPresence();
        return;
      }

      this.setPhasePresence(currentOrLatestPhase);
      Logger.info("PRESENCE", "Presence updated successfully");
    } catch (error) {
      Logger.error("PRESENCE", "Failed to update presence", error);
    }
  }

  private setDefaultPresence(): void {
    this.client.user?.setPresence({
      activities: [{
        name: this.defaultPresenceText,
        type: ActivityType.Custom,
      }],
      status: "online",
    });

    Logger.info("PRESENCE", "Presence updated to default (no lottery data)");
  }

  private setPhasePresence(currentOrLatestPhase: LotteryPhase): void {
    const presenceName = this.formatTimeUntil(currentOrLatestPhase);

    this.client.user?.setPresence({
      activities: [{
        name: presenceName,
        type: ActivityType.Custom,
      }],
      status: "online",
    });
  }

  private formatTimeUntil(currentOrLatestPhase: LotteryPhase): string {
    const now = Date.now() / 1000;
    const diffInSeconds = currentOrLatestPhase.until - now;
    const timeString = this.buildTimeString(diffInSeconds);
    Logger.info(
      "PRESENCE",
      `Setting presence "${timeString}" from seconds "${diffInSeconds}".`,
    );

    if (!currentOrLatestPhase.isCurrent) {
      return currentOrLatestPhase.phaseName + " ended " + timeString + " ago";
    }

    return currentOrLatestPhase.phaseName + " ends in " + timeString;
  }

  private buildTimeString(totalSeconds: number): string {
    const SECONDS_IN_HOUR = 3600;
    const SECONDS_IN_DAY = 86400;

    const days = Math.floor(totalSeconds / SECONDS_IN_DAY);
    const remainingSeconds = totalSeconds - days * SECONDS_IN_DAY;

    const roundedHours = Math.round(remainingSeconds / SECONDS_IN_HOUR);

    if (days > 0) {
      if (roundedHours === 24) {
        return `${days + 1} days`;
      }

      if (roundedHours > 0) {
        return `${days}d, ${roundedHours}h`;
      }

      return `${days} ${days === 1 ? "day" : "days"}`;
    }

    if (roundedHours === 24) {
      return "1 day";
    }

    if (roundedHours >= 2) {
      return `${roundedHours} ${roundedHours === 1 ? "hour" : "hours"}`;
    }

    return "< 1 hour";
  }
}
