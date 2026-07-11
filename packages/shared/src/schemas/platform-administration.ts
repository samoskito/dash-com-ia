import { z } from "zod";
import { platformRoles } from "../roles";
import { externalDataConnectorSchema } from "./external-data-connectors";

const normalizedEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());

export const clientWorkspaceProvisionInputSchema = z.object({
  workspaceName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: normalizedEmailSchema,
  ownerPassword: z.string().min(8).max(256)
});

export const clientWorkspaceProvisionResultSchema = z.object({
  workspace: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
    operationalStatus: z.enum(["active", "blocked"])
  }),
  owner: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
    role: z.literal("owner")
  })
});

export const backofficeClientWorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  operationalStatus: z.enum(["active", "blocked"]),
  createdAt: z.string().datetime(),
  owners: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().nullable(),
      email: z.string().email()
    })
  ),
  connectorCount: z.number().int().nonnegative()
});

export const backofficeClientWorkspaceListSchema = z.array(
  backofficeClientWorkspaceSchema
);

export const platformUserProvisionInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: normalizedEmailSchema,
  password: z.string().min(8).max(256),
  role: z.enum(platformRoles)
});

export const platformUserRoleUpdateInputSchema = z.object({
  role: z.enum(platformRoles).nullable()
});

export const platformUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  email: z.string().email(),
  role: z.enum(platformRoles),
  createdAt: z.string().datetime()
});

export const platformUserListSchema = z.array(platformUserSchema);

export const platformSupportContextSchema = z.object({
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1),
  workspaceSlug: z.string().min(1),
  startedAt: z.string().datetime()
});

export const backofficeConnectorWithWorkspaceSchema =
  externalDataConnectorSchema.extend({
    workspaceName: z.string().min(1).optional()
  });

export type ClientWorkspaceProvisionInputDto = z.infer<
  typeof clientWorkspaceProvisionInputSchema
>;
export type ClientWorkspaceProvisionResultDto = z.infer<
  typeof clientWorkspaceProvisionResultSchema
>;
export type BackofficeClientWorkspaceDto = z.infer<
  typeof backofficeClientWorkspaceSchema
>;
export type PlatformUserProvisionInputDto = z.infer<
  typeof platformUserProvisionInputSchema
>;
export type PlatformUserRoleUpdateInputDto = z.infer<
  typeof platformUserRoleUpdateInputSchema
>;
export type PlatformUserDto = z.infer<typeof platformUserSchema>;
export type PlatformSupportContextDto = z.infer<
  typeof platformSupportContextSchema
>;
