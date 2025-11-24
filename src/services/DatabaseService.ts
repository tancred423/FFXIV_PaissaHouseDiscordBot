import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { eq, lt } from "drizzle-orm";
import { Logger } from "../utils/Logger.ts";
import {
  type GuildSettings,
  guildSettings,
  type NewPaginationState,
  type PaginationState,
  paginationStates,
} from "../db/schema.ts";

export class DatabaseService {
  private static connection: mysql.Connection;
  private static db: MySql2Database;
  private static isReconnecting = false;

  static async initialize(): Promise<void> {
    const host = Deno.env.get("MYSQL_HOST") || "mysql-server";
    const user = Deno.env.get("MYSQL_USER") || "paissa_user";
    const password = Deno.env.get("MYSQL_PASSWORD");
    const database = Deno.env.get("MYSQL_DATABASE") || "paissa_bot";

    if (!password) {
      throw new Error("MYSQL_PASSWORD environment variable is required");
    }

    try {
      this.connection = await mysql.createConnection({
        host,
        user,
        password,
        database,
      });

      this.db = drizzle(this.connection);

      Logger.info("DATABASE", "Running migrations...");
      await migrate(this.db, { migrationsFolder: "./migrations" });
      Logger.info("DATABASE", "Migrations completed successfully");

      Logger.info("STARTUP", "Database initialized successfully");
    } catch (error) {
      Logger.error("STARTUP", "Failed to connect to MySQL:", error);
      throw error;
    }
  }

  private static async isConnectionAlive(): Promise<boolean> {
    if (!this.connection) {
      return false;
    }

    try {
      await this.connection.ping();
      return true;
    } catch {
      return false;
    }
  }

  private static async reconnect(): Promise<void> {
    if (this.isReconnecting) {
      while (this.isReconnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.isReconnecting = true;

    try {
      Logger.warn("DATABASE", "Connection lost, attempting to reconnect...");

      const host = Deno.env.get("MYSQL_HOST") || "mysql-server";
      const user = Deno.env.get("MYSQL_USER") || "paissa_user";
      const password = Deno.env.get("MYSQL_PASSWORD");
      const database = Deno.env.get("MYSQL_DATABASE") || "paissa_bot";

      if (!password) {
        throw new Error("MYSQL_PASSWORD environment variable is required");
      }

      if (this.connection) {
        try {
          await this.connection.end();
        } catch {
          // Ignore errors
        }
      }

      this.connection = await mysql.createConnection({
        host,
        user,
        password,
        database,
      });

      this.db = drizzle(this.connection);

      Logger.info("DATABASE", "Reconnected to database successfully");
    } catch (error) {
      Logger.error("DATABASE", "Failed to reconnect to MySQL:", error);
      throw error;
    } finally {
      this.isReconnecting = false;
    }
  }

  static async getDb(): Promise<MySql2Database> {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }

    const isAlive = await this.isConnectionAlive();
    if (!isAlive) {
      await this.reconnect();
    }

    return this.db;
  }

  static async setAnnouncementChannel(
    guildId: string,
    channelId: string,
  ): Promise<void> {
    const db = await this.getDb();
    await db
      .insert(guildSettings)
      .values({
        guildId,
        announcementChannelId: channelId,
      })
      .onDuplicateKeyUpdate({
        set: { announcementChannelId: channelId },
      });
  }

  static async removeAnnouncementChannel(guildId: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await db
      .delete(guildSettings)
      .where(eq(guildSettings.guildId, guildId));

    return result[0].affectedRows > 0;
  }

  static async getAnnouncementChannel(
    guildId: string,
  ): Promise<string | null> {
    const db = await this.getDb();
    const results = await db
      .select()
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1);

    if (results.length > 0) {
      return results[0].announcementChannelId;
    }
    return null;
  }

  static async getAllGuildSettings(): Promise<GuildSettings[]> {
    const db = await this.getDb();
    return await db.select().from(guildSettings);
  }

  static async savePaginationState(state: NewPaginationState): Promise<void> {
    const db = await this.getDb();
    await db
      .insert(paginationStates)
      .values(state)
      .onDuplicateKeyUpdate({
        set: {
          currentPage: state.currentPage,
          totalPages: state.totalPages,
          worldDetailJson: state.worldDetailJson,
        },
      });
  }

  static async getPaginationState(
    stateId: string,
  ): Promise<PaginationState | null> {
    const db = await this.getDb();
    const results = await db
      .select()
      .from(paginationStates)
      .where(eq(paginationStates.stateId, stateId))
      .limit(1);

    if (results.length > 0) {
      return results[0];
    }
    return null;
  }

  static async deletePaginationState(stateId: string): Promise<void> {
    const db = await this.getDb();
    await db
      .delete(paginationStates)
      .where(eq(paginationStates.stateId, stateId));
  }

  static async getActivePaginationStates(): Promise<PaginationState[]> {
    const db = await this.getDb();
    return await db
      .select()
      .from(paginationStates);
  }

  static async deleteExpiredPaginationStates(): Promise<number> {
    const db = await this.getDb();
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(paginationStates)
      .where(lt(paginationStates.createdAt, oneWeekAgo));

    return result[0].affectedRows;
  }

  static async getAllPaginationStates(): Promise<PaginationState[]> {
    const db = await this.getDb();
    return await db.select().from(paginationStates);
  }

  static async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
    }
  }
}

export type { GuildSettings, PaginationState } from "../db/schema.ts";
