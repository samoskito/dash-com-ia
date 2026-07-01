import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import {
  DIAGNOSTIC_QUEUE,
  type DiagnosticJobPayload
} from "./queue.constants";

@Processor(DIAGNOSTIC_QUEUE)
export class DiagnosticProcessor extends WorkerHost {
  async process(job: Job<DiagnosticJobPayload>) {
    const { workspaceId, source } = job.data;

    return {
      stored: true,
      workspaceId,
      source
    };
  }
}
