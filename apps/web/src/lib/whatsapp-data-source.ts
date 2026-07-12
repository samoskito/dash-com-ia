import type { WhatsappDataSourceDto } from "@wpptrack/shared";
import { serverApiFetch } from "./server-api";

export async function getWhatsappDataSource(): Promise<WhatsappDataSourceDto | null> {
  try {
    const source = await serverApiFetch<WhatsappDataSourceDto>(
      "/integrations/whatsapp/source",
    );

    return source?.mode === "external" || source?.mode === "native"
      ? source
      : null;
  } catch {
    return null;
  }
}
