import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/auth.service";

describe("auth module wiring", () => {
  it("resolves AuthService dependencies in the Nest runtime container", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule]
    }).compile();

    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);

    await moduleRef.close();
  });
});
