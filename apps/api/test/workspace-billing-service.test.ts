import { describe, expect, it } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

function createHarness() {
  const db = {
    workspaces: [
      {
        id: "workspace_1",
        name: "Comunidade NOD",
        slug: "comunidade-nod",
        asaasCustomerId: null,
        subscriptions: [],
        whatsappInstances: []
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
    },
    whatsappInstance: {
      findMany: async () =>
        db.workspaces
          .flatMap((workspace) =>
            (workspace.whatsappInstances as Array<Record<string, unknown>>).map(
              (instance) => ({
                ...instance,
                workspace: {
                  name: workspace.name
                }
              })
            )
          )
          .sort((first, second) => {
            const workspaceComparison = String(first.workspace.name).localeCompare(
              String(second.workspace.name)
            );

            if (workspaceComparison !== 0) {
              return workspaceComparison;
            }

            return (
              ((second as Record<string, unknown>).createdAt as Date).getTime() -
              ((first as Record<string, unknown>).createdAt as Date).getTime()
            );
          })
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
      asaasCustomerId: "cus_asaas_1",
      subscriptionStatus: "not_configured",
      activeInstances: 0
    });
    expect(db.workspaces[0].asaasCustomerId).toBe("cus_asaas_1");
  });

  it("lists workspaces with billing configuration ordered by name", async () => {
    const { db, service } = createHarness();
    db.workspaces.push({
      id: "workspace_2",
      name: "Clinica Norte",
      slug: "clinica-norte",
      asaasCustomerId: null,
      subscriptions: [
        {
          status: "active",
          activeInstances: 3
        }
      ],
      whatsappInstances: []
    });

    const result = await service.listBillingConfigurations();

    expect(result).toEqual([
      {
        id: "workspace_2",
        name: "Clinica Norte",
        slug: "clinica-norte",
        asaasCustomerId: null,
        subscriptionStatus: "active",
        activeInstances: 3
      },
      {
        id: "workspace_1",
        name: "Comunidade NOD",
        slug: "comunidade-nod",
        asaasCustomerId: null,
        subscriptionStatus: "not_configured",
        activeInstances: 0
      }
    ]);
  });

  it("lists whatsapp instances across workspaces for backoffice operations", async () => {
    const { db, service } = createHarness();
    db.workspaces.push({
      id: "workspace_2",
      name: "Clinica Norte",
      slug: "clinica-norte",
      asaasCustomerId: "cus_asaas_2",
      subscriptions: [],
      whatsappInstances: [
        {
          id: "wpp_2",
          workspaceId: "workspace_2",
          name: "Recepcao",
          provider: "uazapi",
          status: "pending_payment",
          providerInstanceId: null,
          createdAt: new Date("2026-07-02T03:00:00.000Z"),
          updatedAt: new Date("2026-07-02T03:05:00.000Z")
        }
      ]
    });
    db.workspaces[0].whatsappInstances = [
      {
        id: "wpp_1",
        workspaceId: "workspace_1",
        name: "Comercial",
        provider: "uazapi",
        status: "active",
        providerInstanceId: "uazapi_1",
        createdAt: new Date("2026-07-02T04:00:00.000Z"),
        updatedAt: new Date("2026-07-02T04:10:00.000Z")
      }
    ];

    const result = await service.listBackofficeWhatsappInstances();

    expect(result).toEqual([
      {
        id: "wpp_2",
        workspaceId: "workspace_2",
        workspaceName: "Clinica Norte",
        name: "Recepcao",
        provider: "uazapi",
        billingStatus: "pending_payment",
        providerInstanceId: null,
        createdAt: "2026-07-02T03:00:00.000Z",
        updatedAt: "2026-07-02T03:05:00.000Z"
      },
      {
        id: "wpp_1",
        workspaceId: "workspace_1",
        workspaceName: "Comunidade NOD",
        name: "Comercial",
        provider: "uazapi",
        billingStatus: "active",
        providerInstanceId: "uazapi_1",
        createdAt: "2026-07-02T04:00:00.000Z",
        updatedAt: "2026-07-02T04:10:00.000Z"
      }
    ]);
  });
});
