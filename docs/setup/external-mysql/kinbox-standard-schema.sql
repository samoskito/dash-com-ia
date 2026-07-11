-- WppTrack external MySQL contract for the standardized Kinbox installation.
-- Replace every {{CLIENT_SUFFIX}} before running this script.
-- Run with an operator account. WppTrack itself must use a read-only account.

SET @legacy_table = 'whatsapp_anuncio_{{CLIENT_SUFFIX}}';
SET @row_id_exists = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @legacy_table
     AND COLUMN_NAME = 'wpptrack_row_id'
);
SET @add_row_id_sql = IF(
  @row_id_exists > 0,
  'SELECT 1',
  'ALTER TABLE `whatsapp_anuncio_{{CLIENT_SUFFIX}}` ADD COLUMN `wpptrack_row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ADD UNIQUE KEY `uk_wpptrack_row_id` (`wpptrack_row_id`)'
);
PREPARE add_row_id_statement FROM @add_row_id_sql;
EXECUTE add_row_id_statement;
DEALLOCATE PREPARE add_row_id_statement;

CREATE TABLE IF NOT EXISTS `wpptrack_tracking_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dedupe_key` VARCHAR(255) NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `event_type` VARCHAR(50) NOT NULL,
  `source_event_name` VARCHAR(150) DEFAULT NULL,
  `external_event_id` VARCHAR(255) DEFAULT NULL,
  `external_lead_id` VARCHAR(255) DEFAULT NULL,
  `transaction_id` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(32) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `event_local_date` DATE NOT NULL,
  `ad_id` VARCHAR(100) DEFAULT NULL,
  `adset_id` VARCHAR(100) DEFAULT NULL,
  `campaign_id` VARCHAR(100) DEFAULT NULL,
  `ctwa_clid` VARCHAR(512) DEFAULT NULL,
  `source_url` TEXT,
  `value_cents` BIGINT DEFAULT NULL,
  `currency` CHAR(3) DEFAULT NULL,
  `value_source` VARCHAR(50) DEFAULT NULL,
  `duplicate_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wpptrack_event_dedupe` (`dedupe_key`),
  KEY `idx_wpptrack_events_cursor` (`updated_at`, `id`),
  KEY `idx_wpptrack_events_phone_time` (`phone`, `occurred_at`),
  KEY `idx_wpptrack_events_type_date` (`event_type`, `event_local_date`),
  KEY `idx_wpptrack_events_external_event` (`external_event_id`),
  KEY `idx_wpptrack_events_transaction` (`transaction_id`),
  CONSTRAINT `chk_wpptrack_event_type`
    CHECK (`event_type` IN ('conversation_started', 'qualified_lead', 'purchase')),
  CONSTRAINT `chk_wpptrack_value_source`
    CHECK (`value_source` IS NULL OR `value_source` IN ('actual', 'configured_average', 'manual'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE OR REPLACE VIEW `vw_wpptrack_leads` AS
SELECT
  wa.`wpptrack_row_id` AS `external_row_id`,
  COALESCE(NULLIF(wa.`lid`, ''), NULLIF(wa.`id_transacao`, ''), wa.`telefone`) AS `external_lead_id`,
  wa.`telefone` AS `phone`,
  NULLIF(TRIM(CONCAT_WS(' ', wa.`nome`, wa.`sobrenome`)), '') AS `name`,
  NULLIF(wa.`email`, '') AS `email`,
  NULLIF(wa.`cidade`, '') AS `city`,
  NULLIF(wa.`estado`, '') AS `state`,
  NULLIF(wa.`pais`, '') AS `country`,
  CAST(wa.`data_criacao` AS DATETIME) AS `first_message_at`,
  wa.`updated_at` AS `last_message_at`,
  CAST(wa.`data_qualificado` AS DATETIME) AS `qualified_at`,
  CAST(wa.`data_compra` AS DATETIME) AS `purchased_at`,
  NULLIF(wa.`source_id`, '') AS `ad_id`,
  NULLIF(wa.`ctwaclid`, '') AS `ctwa_clid`,
  NULLIF(wa.`source_url`, '') AS `source_url`,
  NULLIF(wa.`status`, '') AS `status`,
  wa.`updated_at` AS `updated_at`
FROM `whatsapp_anuncio_{{CLIENT_SUFFIX}}` wa;

CREATE OR REPLACE VIEW `vw_wpptrack_events` AS
SELECT
  e.`id` AS `external_row_id`,
  e.`dedupe_key`,
  e.`provider`,
  e.`event_type`,
  e.`source_event_name`,
  e.`external_event_id`,
  e.`external_lead_id`,
  e.`transaction_id`,
  e.`phone`,
  e.`occurred_at`,
  e.`event_local_date`,
  e.`ad_id`,
  e.`adset_id`,
  e.`campaign_id`,
  e.`ctwa_clid`,
  e.`source_url`,
  e.`value_cents`,
  e.`currency`,
  e.`value_source`,
  e.`duplicate_count`,
  e.`updated_at`
FROM `wpptrack_tracking_events` e;

-- Replace the account name before running these grants. Do not reuse the n8n user.
-- CREATE USER 'wpptrack_reader'@'%' IDENTIFIED BY 'GENERATE_A_STRONG_PASSWORD';
-- GRANT SELECT ON `tracking`.`vw_wpptrack_leads` TO 'wpptrack_reader'@'%';
-- GRANT SELECT ON `tracking`.`vw_wpptrack_events` TO 'wpptrack_reader'@'%';
-- FLUSH PRIVILEGES;
