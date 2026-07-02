import { describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("app module", () => {
  it("does not register mock controllers or providers", () => {
    const controllers = Reflect.getMetadata("controllers", AppModule) as
      | Array<Function>
      | undefined;
    const providers = Reflect.getMetadata("providers", AppModule) as
      | Array<Function>
      | undefined;

    expect(controllers?.map((controller) => controller.name)).not.toContain(
      "MockController"
    );
    expect(providers?.map((provider) => provider.name)).not.toContain(
      "MockService"
    );
  });
});
