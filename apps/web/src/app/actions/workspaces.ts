"use server";

import {
  workspaceActiveInputSchema,
  type CurrentWorkspaceDto
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../lib/server-api";

export type WorkspaceSwitchActionResult = {
  ok: boolean;
};

export async function switchActiveWorkspace(
  workspaceId: string
): Promise<WorkspaceSwitchActionResult> {
  const parsed = workspaceActiveInputSchema.safeParse({ workspaceId });

  if (!parsed.success) {
    return { ok: false };
  }

  try {
    await serverApiFetch<CurrentWorkspaceDto>("/workspaces/active", {
      method: "POST",
      body: JSON.stringify(parsed.data)
    });
  } catch {
    return { ok: false };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
