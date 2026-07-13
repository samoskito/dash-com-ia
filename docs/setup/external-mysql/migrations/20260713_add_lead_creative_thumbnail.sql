-- Exposes the creative thumbnail already stored by the official Meta workflow.
-- Replace {{CLIENT_SUFFIX}} before running this statement in the external MySQL.

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
FROM `whatsapp_anuncio_{{CLIENT_SUFFIX}}` wa;
