import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  CLIENT_SWAP_EXTERNAL_HARD_PARENT_EDGES,
  CLIENT_SWAP_EXTERNAL_PARENT_HANDLING,
  CLIENT_SWAP_RESTRICT_EDGES,
  CLIENT_SWAP_WIPE_DELEGATES,
} from "../src/workspaces/client-swap/client-swap.service";
import {
  deriveHardDeleteEdges,
  type PrismaHardDeleteEdge,
} from "./support/prisma-schema-fk-graph";

const schemaPath = join(__dirname, "..", "prisma", "schema.prisma");
const schemaSource = readFileSync(schemaPath, "utf8");

function internalEdgeKey([child, parent]: readonly [string, string]): string {
  return `${child}->${parent}`;
}

function schemaEdgeKey(edge: PrismaHardDeleteEdge): string {
  return `${edge.child}.${edge.relationField}->${edge.parent}:${edge.onDelete}`;
}

function declaredExternalEdgeKey([
  child,
  parent,
  relationField,
  onDelete,
]: (typeof CLIENT_SWAP_EXTERNAL_HARD_PARENT_EDGES)[number]): string {
  return `${child}.${relationField}->${parent}:${onDelete}`;
}

describe("client swap wipe order vs real schema.prisma FK edges", () => {
  const realEdges = deriveHardDeleteEdges(
    schemaSource,
    CLIENT_SWAP_WIPE_DELEGATES,
  );
  const wipedDelegates = new Set<string>(CLIENT_SWAP_WIPE_DELEGATES);
  const internalEdges = realEdges.filter((edge) =>
    wipedDelegates.has(edge.parent),
  );
  const externalEdges = realEdges.filter(
    (edge) => !wipedDelegates.has(edge.parent),
  );

  it("finds non-trivial internal and external hard edges (parser sanity check)", () => {
    // Guards against a silently-broken parser (e.g. a schema.prisma
    // formatting change) making this suite vacuously pass with 0 edges.
    expect(realEdges.length).toBeGreaterThan(40);
    expect(internalEdges.length).toBeGreaterThan(20);
    expect(externalEdges.length).toBeGreaterThan(4);
  });

  it("has every internal schema edge respected by the exported wipe order (child before parent)", () => {
    const sequence: string[] = [...CLIENT_SWAP_WIPE_DELEGATES];

    for (const { child, parent } of internalEdges) {
      const childIndex = sequence.indexOf(child);
      const parentIndex = sequence.indexOf(parent);

      expect(
        childIndex,
        `"${child}" missing from CLIENT_SWAP_WIPE_DELEGATES`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        parentIndex,
        `"${parent}" missing from CLIENT_SWAP_WIPE_DELEGATES`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        childIndex,
        `expected "${child}" to be wiped before its Restrict/required parent "${parent}"`,
      ).toBeLessThan(parentIndex);
    }
  });

  it("accounts for every external hard parent with an explicit retained-parent strategy", () => {
    const real = new Set(externalEdges.map(schemaEdgeKey));
    const declared = new Set(
      CLIENT_SWAP_EXTERNAL_HARD_PARENT_EDGES.map(declaredExternalEdgeKey),
    );

    expect(
      [...real].filter((key) => !declared.has(key)),
      "schema.prisma has an external Restrict/NoAction/default-required FK with no client-swap strategy",
    ).toEqual([]);
    expect(
      [...declared].filter((key) => !real.has(key)),
      "CLIENT_SWAP_EXTERNAL_HARD_PARENT_EDGES has an edge that no longer exists in schema.prisma",
    ).toEqual([]);

    const actualParents = new Set(externalEdges.map((edge) => edge.parent));
    expect(new Set(Object.keys(CLIENT_SWAP_EXTERNAL_PARENT_HANDLING))).toEqual(
      actualParents,
    );
    for (const parent of actualParents) {
      expect(
        CLIENT_SWAP_EXTERNAL_PARENT_HANDLING[
          parent as keyof typeof CLIENT_SWAP_EXTERNAL_PARENT_HANDLING
        ],
      ).toMatchObject({
        action: "preserve-parent",
        referentialIntegrity: "delete-child",
      });
    }
  });

  it("keeps internal Restrict/default-required metadata in sync with the real schema", () => {
    const real = new Set(
      internalEdges.map((edge) => `${edge.child}->${edge.parent}`),
    );
    const declared = new Set(CLIENT_SWAP_RESTRICT_EDGES.map(internalEdgeKey));

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
