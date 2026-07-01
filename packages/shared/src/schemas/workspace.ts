import { z } from "zod";
import { workspaceRoles } from "../roles";

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  role: z.enum(workspaceRoles)
});

export type WorkspaceDto = z.infer<typeof workspaceSchema>;
