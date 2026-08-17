import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ClientSwapModule } from "../src/workspaces/client-swap/client-swap.module";
import { ClientSwapService } from "../src/workspaces/client-swap/client-swap.service";

describe("app module", () => {
  it("does not register mock controllers or providers", () => {
    const controllers = Reflect.getMetadata("controllers", AppModule) as
      | Array<Function>
      | undefined;
    const providers = Reflect.getMetadata("providers", AppModule) as
      | Array<Function>
      | undefined;

    expect(controllers?.map((controller) => controller.name)).not.toContain(
      "MockController",
    );
    expect(providers?.map((provider) => provider.name)).not.toContain(
      "MockService",
    );
  });

  it("resolves the full application dependency graph without wiring errors", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // compile() resolves the DI graph (constructor injection, guards, etc.)
    // without triggering onModuleInit hooks (Prisma $connect), so no database
    // is required. This catches Nest "can't resolve dependencies" errors that
    // would crash the container at runtime.
    const clientSwapService = moduleRef.get(ClientSwapService, {
      strict: false,
    });
    expect(clientSwapService).toBeDefined();
  });

  it("resolves ClientSwapModule providers including PrismaService dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClientSwapModule],
    }).compile();

    const clientSwapService = moduleRef.get(ClientSwapService, {
      strict: false,
    });
    expect(clientSwapService).toBeInstanceOf(ClientSwapService);
  });
});
