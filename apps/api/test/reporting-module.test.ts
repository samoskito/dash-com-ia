import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { MetaReportingService } from "../src/reporting/meta-reporting.service";
import { ReportingModule } from "../src/reporting/reporting.module";

describe("reporting module wiring", () => {
  it("resolves MetaReportingService dependencies from imported modules", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ReportingModule]
    }).compile();

    expect(moduleRef.get(MetaReportingService)).toBeInstanceOf(
      MetaReportingService
    );

    await moduleRef.close();
  });
});
