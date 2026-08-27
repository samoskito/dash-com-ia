import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  CLIENT_SWAP_RESTRICT_EDGES,
  CLIENT_SWAP_WIPE_DELEGATES,
} from "../src/workspaces/client-swap/client-swap.service";
import { deriveHardDeleteEdges } from "./support/prisma-schema-fk-graph";

const schemaPath = join(__dirname, "..", "prisma", "schema.prisma");
const schemaSource = readFileSync(schemaPath, "utf8");

function edgeKey([child, parent]: readonly [string, string]): string {
  return `${child}->${parent}`;
}

describe("client swap wipe order vs real schema.prisma FK edges", () => {
  const realEdges = deriveHardDeleteEdges(schemaSource, CLIENT_SWAP_WIPE_DELEGATES);

  it("finds a non-trivial number of Restrict/default-required edges (parser sanity check)", () => {
    // Guards against a silently-broken parser (e.g. a schema.prisma
    // formatting change) making this suite vacuously pass with 0 edges.
    expect(realEdges.length).toBeGreaterThan(20);
  });

  it("has every real schema edge respected by the exported wipe order (child before parent)", () => {
    const sequence: string[] = [...CLIENT_SWAP_WIPE_DELEGATES];

    for (const [child, parent] of realEdges) {
      const childIndex = sequence.indexOf(child);
      const parentIndex = sequence.indexOf(parent);

      expect(childIndex, `"${child}" missing from CLIENT_SWAP_WIPE_DELEGATES`).toBeGreaterThanOrEqual(0);
      expect(parentIndex, `"${parent}" missing from CLIENT_SWAP_WIPE_DELEGATES`).toBeGreaterThanOrEqual(0);
      expect(
        childIndex,
        `expected "${child}" to be wiped before its Restrict/required parent "${parent}"`,
      ).toBeLessThan(parentIndex);
    }
  });

  it("keeps CLIENT_SWAP_RESTRICT_EDGES in sync with the real schema (no hand-drift)", () => {
    const real = new Set(realEdges.map(edgeKey));
    const declared = new Set(CLIENT_SWAP_RESTRICT_EDGES.map(edgeKey));

    const missingFromDeclared = [...real].filter((key) => !declared.has(key));
    const staleInDeclared = [...declared].filter((key) => !real.has(key));

    expect(
      missingFromDeclared,
      "schema.prisma has Restrict/default-required edges not reflected in CLIENT_SWAP_RESTRICT_EDGES",
    ).toEqual([]);
    expect(
      staleInDeclared,
      "CLIENT_SWAP_RESTRICT_EDGES has edges that no longer exist in schema.prisma",
    ).toEqual([]);
  });
});
