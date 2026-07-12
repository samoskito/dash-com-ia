-- Apply once before activating the durable official Meta workflow.
-- Run with the n8n/operator MySQL account.

CREATE TABLE IF NOT EXISTS `wpptrack_webhook_inbox` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `delivery_key` VARCHAR(80) NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `payload_text` LONGTEXT NOT NULL,
  `is_test` TINYINT(1) NOT NULL DEFAULT 0,
  `duplicate_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wpptrack_webhook_delivery` (`delivery_key`),
  KEY `idx_wpptrack_webhook_cursor` (`updated_at`, `id`),
  CONSTRAINT `chk_wpptrack_webhook_provider`
    CHECK (`provider` IN ('meta_whatsapp_official')),
  CONSTRAINT `chk_wpptrack_webhook_is_test`
    CHECK (`is_test` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT
  `delivery_key`,
  `provider`,
  `is_test`,
  `duplicate_count`,
  `created_at`
FROM `wpptrack_webhook_inbox`
ORDER BY `id` DESC
LIMIT 1;
