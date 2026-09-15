-- Allow webhook/diagnostic logs to record Payt automation deliveries.
ALTER TYPE "DiagnosticSource" ADD VALUE IF NOT EXISTS 'payt';
