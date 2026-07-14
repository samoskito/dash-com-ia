import { describe, expect, it, vi } from "vitest";
import { DiagnosticProcessor } from "../src/common/queue/diagnostic.processor";

function createPrismaHarness() {
  return {
    diagnosticEvent: {
      findUnique: vi.fn(async () => ({ id: "diag_1" }))
    },
    jobAttempt: {
      create: vi.fn(async ({ data }) => ({ id: "job_attempt_1", ...data }))
    }
  };
}

describe("diagnostic processor", () => {
  it("reprocesses linked conversion events and records the worker attempt", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn(async () => ({
        conversionEventLogId: "conversion_1",
        status: "sent"
      }))
    };
    const prisma = createPrismaHarness();
    const processor = new DiagnosticProcessor(
      conversionEventsService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "bull_job_1",
        name: "retry-diagnostic-event",
        attemptsMade: 0,
        data: {
          diagnosticEventId: "diag_1",
          workspaceId: "workspace_1",
          source: "meta",
          message: "Meta recusou evento",
          occurredAt: "2026-07-02T03:00:00.000Z",
          conversionEventLogId: "conversion_1",
          retryReason: "Cliente relatou conversao ausente"
        }
      } as never)
    ).resolves.toEqual({
      diagnosticEventId: "diag_1",
      action: "conversion_event_retry",
      result: {
        conversionEventLogId: "conversion_1",
        status: "sent"
      }
    });

    expect(conversionEventsService.sendReadyEvent).toHaveBeenCalledWith(
      "conversion_1",
      { workspaceId: "workspace_1" }
    );
    expect(prisma.jobAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        queueName: "diagnostic-events",
        jobId: "bull_job_1",
        jobName: "retry-diagnostic-event",
        attemptNumber: 1,
        status: "sent",
        source: "meta",
        relatedEntityType: "DiagnosticEvent",
        relatedEntityId: "diag_1",
        errorCode: null,
        errorMessage: null,
        summaryPayload: expect.objectContaining({
          action: "conversion_event_retry",
          conversionEventLogId: "conversion_1",
          resultStatus: "sent",
          retryReason: "Cliente relatou conversao ausente"
        })
      })
    });
  });

  it("does not fail a completed diagnostic retry when attempt logging fails", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn(async () => ({
        conversionEventLogId: "conversion_1",
        status: "sent"
      }))
    };
    const prisma = {
      ...createPrismaHarness(),
      jobAttempt: {
        create: vi.fn(async () => {
          throw new Error("database unavailable");
        })
      }
    };
    const processor = new DiagnosticProcessor(
      conversionEventsService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "bull_job_1",
        name: "retry-diagnostic-event",
        attemptsMade: 0,
        data: {
          diagnosticEventId: "diag_1",
          workspaceId: "workspace_1",
          source: "meta",
          message: "Meta recusou evento",
          occurredAt: "2026-07-02T03:00:00.000Z",
          conversionEventLogId: "conversion_1"
        }
      } as never)
    ).resolves.toEqual({
      diagnosticEventId: "diag_1",
      action: "conversion_event_retry",
      result: {
        conversionEventLogId: "conversion_1",
        status: "sent"
      }
    });

    expect(conversionEventsService.sendReadyEvent).toHaveBeenCalledTimes(1);
    expect(prisma.jobAttempt.create).toHaveBeenCalledTimes(1);
  });

  it("skips unsupported diagnostic retries without calling providers and records the attempt", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn()
    };
    const prisma = createPrismaHarness();
    const processor = new DiagnosticProcessor(
      conversionEventsService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "bull_job_2",
        name: "retry-diagnostic-event",
        attemptsMade: 1,
        data: {
          diagnosticEventId: "diag_1",
          workspaceId: "workspace_1",
          source: "uazapi",
          message: "Webhook recebido",
          occurredAt: "2026-07-02T03:00:00.000Z"
        }
      } as never)
    ).resolves.toEqual({
      diagnosticEventId: "diag_1",
      action: "skipped",
      reason: "unsupported_diagnostic_event"
    });

    expect(conversionEventsService.sendReadyEvent).not.toHaveBeenCalled();
    expect(prisma.jobAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        queueName: "diagnostic-events",
        jobId: "bull_job_2",
        jobName: "retry-diagnostic-event",
        attemptNumber: 2,
        status: "skipped",
        source: "uazapi",
        relatedEntityType: "DiagnosticEvent",
        relatedEntityId: "diag_1",
        errorCode: null,
        errorMessage: null,
        summaryPayload: expect.objectContaining({
          action: "skipped",
          reason: "unsupported_diagnostic_event"
        })
      })
    });
  });

  it("records failed diagnostic worker attempts and rethrows the error", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn(async () => {
        throw new Error("Meta timeout");
      })
    };
    const prisma = createPrismaHarness();
    const processor = new DiagnosticProcessor(
      conversionEventsService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "bull_job_3",
        name: "retry-diagnostic-event",
        attemptsMade: 2,
        data: {
          diagnosticEventId: "diag_1",
          workspaceId: "workspace_1",
          source: "meta",
          message: "Meta recusou evento",
          occurredAt: "2026-07-02T03:00:00.000Z",
          conversionEventLogId: "conversion_1"
        }
      } as never)
    ).rejects.toThrow("Meta timeout");

    expect(prisma.jobAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        queueName: "diagnostic-events",
        jobId: "bull_job_3",
        jobName: "retry-diagnostic-event",
        attemptNumber: 3,
        status: "failed",
        source: "meta",
        relatedEntityType: "DiagnosticEvent",
        relatedEntityId: "diag_1",
        errorCode: null,
        errorMessage: "Meta timeout",
        summaryPayload: expect.objectContaining({
          action: "conversion_event_retry",
          conversionEventLogId: "conversion_1"
        })
      })
    });
  });

  it("rejects a diagnostic from another workspace before retrying its conversion", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn()
    };
    const prisma = createPrismaHarness();
    prisma.diagnosticEvent.findUnique.mockResolvedValueOnce(null as never);
    const processor = new DiagnosticProcessor(
      conversionEventsService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "bull_job_cross_tenant",
        name: "retry-diagnostic-event",
        attemptsMade: 0,
        data: {
          diagnosticEventId: "diag_workspace_2",
          workspaceId: "workspace_1",
          source: "meta",
          message: "Meta recusou evento",
          occurredAt: "2026-07-02T03:00:00.000Z",
          conversionEventLogId: "conversion_workspace_2"
        }
      } as never)
    ).rejects.toThrow("Evento de diagnostico nao encontrado");

    expect(prisma.diagnosticEvent.findUnique).toHaveBeenCalledWith({
      where: {
        id: "diag_workspace_2",
        workspaceId: "workspace_1"
      },
      select: { id: true }
    });
    expect(conversionEventsService.sendReadyEvent).not.toHaveBeenCalled();
  });

  it("rejects a linked conversion from another workspace", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn(async () => {
        throw new Error("Evento de conversao nao encontrado");
      })
    };
    const prisma = createPrismaHarness();
    const processor = new DiagnosticProcessor(
      conversionEventsService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "bull_job_cross_tenant_conversion",
        name: "retry-diagnostic-event",
        attemptsMade: 0,
        data: {
          diagnosticEventId: "diag_1",
          workspaceId: "workspace_1",
          source: "meta",
          message: "Meta recusou evento",
          occurredAt: "2026-07-02T03:00:00.000Z",
          conversionEventLogId: "conversion_workspace_2"
        }
      } as never)
    ).rejects.toThrow("Evento de conversao nao encontrado");

    expect(conversionEventsService.sendReadyEvent).toHaveBeenCalledWith(
      "conversion_workspace_2",
      { workspaceId: "workspace_1" }
    );
  });
});
