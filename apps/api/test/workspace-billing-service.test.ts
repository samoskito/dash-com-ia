import { describe, expect, it } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

function createHarness() {
  const db = {
    workspaces: [
      {
        id: "workspace_1",
        name: "Comunidade NOD",
        slug: "comunidade-nod",
        asaasCustomerId: null
      }
    ] as Array<Record<string, unknown>>
  };
  const prisma = {
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.workspaces.find((workspace) => workspace.id === where.id) ?? null,
      findMany: async () =>
        [...db.workspaces].sort((first, second) =>
          String(first.name).localeCompare(String(second.name))
        ),
      update: async ({
        data,
        where
      }: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const index = db.workspaces.findIndex(
          (workspace) => workspace.id === where.id
        );
        db.workspaces[index] = {
          ...db.workspaces[index],
          ...data
        };
        return db.workspaces[index];
      }
    }
  };

  return {
    db,
    service: new WorkspacesService(prisma as never)
  };
}

describe("workspace billing service", () => {
  it("updates Asaas customer id for workspace billing", async () => {
    const { db, service } = createHarness();

    const updated = await service.updateBillingConfiguration("workspace_1", {
      asaasCustomerId: " cus_asaas_1 "
    });

    expect(updated).toEqual({
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      asaasCustomerId: "cus_asaas_1"
    });
    expect(db.workspaces[0].asaasCustomerId).toBe("cus_asaas_1");
  });

  it("lists workspaces with billing configuration ordered by name", async () => {
    const { db, service } = createHarness();
    db.workspaces.push({
      id: "workspace_2",
      name: "Clinica Norte",
      slug: "clinica-norte",
      asaasCustomerId: null
    });

    const result = await service.listBillingConfigurations();

    expect(result).toEqual([
      {
        id: "workspace_2",
        name: "Clinica Norte",
        slug: "clinica-norte",
        asaasCustomerId: null
      },
      {
        id: "workspace_1",
        name: "Comunidade NOD",
        slug: "comunidade-nod",
        asaasCustomerId: null
      }
    ]);
  });
});
