CREATE TABLE IF NOT EXISTS `pagination_states` (
	`state_id` varchar(100) NOT NULL,
	`user_id` varchar(20) NOT NULL,
	`channel_id` varchar(20) NOT NULL,
	`message_id` varchar(20) NOT NULL,
	`guild_id` varchar(20),
	`world_id` bigint NOT NULL,
	`district_id` bigint,
	`size_filter` bigint,
	`lottery_phase_filter` bigint,
	`allowed_tenants_filter` bigint,
	`current_page` bigint NOT NULL,
	`total_pages` bigint NOT NULL,
	`world_detail_json` longtext NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `pagination_states_state_id` PRIMARY KEY(`state_id`),
	INDEX `idx_created_at` (`created_at`),
	INDEX `idx_user_id` (`user_id`)
);

