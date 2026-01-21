import { bigint, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";

export const guildSettings = mysqlTable("guild_settings", {
  guildId: varchar("guild_id", { length: 20 }).primaryKey(),
  announcementChannelId: varchar("announcement_channel_id", { length: 20 })
    .notNull(),
});

export const paginationStates = mysqlTable("pagination_states", {
  stateId: varchar("state_id", { length: 100 }).primaryKey(),
  userId: varchar("user_id", { length: 20 }).notNull(),
  channelId: varchar("channel_id", { length: 20 }).notNull(),
  messageId: varchar("message_id", { length: 20 }).notNull(),
  guildId: varchar("guild_id", { length: 20 }),
  worldId: bigint("world_id", { mode: "number" }).notNull(),
  districtId: bigint("district_id", { mode: "number" }),
  sizeFilter: bigint("size_filter", { mode: "number" }),
  lotteryPhaseFilter: bigint("lottery_phase_filter", { mode: "number" }),
  allowedTenantsFilter: bigint("allowed_tenants_filter", { mode: "number" }),
  plotFilter: bigint("plot_filter", { mode: "number" }),
  wardFilter: bigint("ward_filter", { mode: "number" }),
  currentPage: bigint("current_page", { mode: "number" }).notNull(),
  totalPages: bigint("total_pages", { mode: "number" }).notNull(),
  worldDetailJson: text("world_detail_json").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  lastRefreshed: bigint("last_refreshed", { mode: "number" }).notNull(),
});

export type GuildSettings = typeof guildSettings.$inferSelect;
export type NewGuildSettings = typeof guildSettings.$inferInsert;
export type PaginationState = typeof paginationStates.$inferSelect;
export type NewPaginationState = typeof paginationStates.$inferInsert;
