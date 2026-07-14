-- One-time cleanup for an external Kinbox workspace that tracks paid traffic only.
-- Replace {{CLIENT_SUFFIX}} before running this file in the external MySQL.
-- The raw wpptrack_webhook_inbox is intentionally preserved for delivery recovery.

START TRANSACTION;

DELETE FROM `wpptrack_tracking_events`
WHERE NULLIF(TRIM(`ctwa_clid`), '') IS NULL;

DELETE FROM `whatsapp_anuncio_{{CLIENT_SUFFIX}}`
WHERE NULLIF(TRIM(`ctwaclid`), '') IS NULL;

COMMIT;

CREATE OR REPLACE VIEW `vw_wpptrack_leads` AS
SELECT
  SHA2(CONCAT('lead:', wa.`telefone`), 256) AS `external_row_id`,
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
  NULLIF(wa.`thumbnail`, '') AS `thumbnail_url`,
  NULLIF(wa.`status`, '') AS `status`,
  wa.`updated_at` AS `updated_at`
FROM `whatsapp_anuncio_{{CLIENT_SUFFIX}}` wa
WHERE NULLIF(TRIM(wa.`ctwaclid`), '') IS NOT NULL;

CREATE OR REPLACE VIEW `vw_wpptrack_events` AS
SELECT
  LPAD(CAST(e.`id` AS CHAR), 20, '0') AS `external_row_id`,
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
FROM `wpptrack_tracking_events` e
WHERE NULLIF(TRIM(e.`ctwa_clid`), '') IS NOT NULL;
