import { Global, Module } from "@nestjs/common";

export type RuntimeEnv = Record<string, string | undefined>;
export type RuntimeFetch = typeof fetch;

export const RUNTIME_ENV = Symbol("RUNTIME_ENV");
export const RUNTIME_FETCH = Symbol("RUNTIME_FETCH");

@Global()
@Module({
  providers: [
    {
      provide: RUNTIME_ENV,
      useValue: process.env
    },
    {
      provide: RUNTIME_FETCH,
      useValue: fetch
    }
  ],
  exports: [RUNTIME_ENV, RUNTIME_FETCH]
})
export class RuntimeModule {}
