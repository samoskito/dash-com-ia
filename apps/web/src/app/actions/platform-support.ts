"use server";

import { redirect } from "next/navigation";
import { serverApiFetch } from "../../lib/server-api";

export async function exitPlatformSupportAccess() {
  await serverApiFetch("/backoffice/workspaces/support-access", {
    method: "DELETE"
  });
  redirect("/backoffice/clients?notice=Contexto+de+suporte+encerrado");
}
