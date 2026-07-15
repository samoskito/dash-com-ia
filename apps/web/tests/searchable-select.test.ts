import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  filterSearchableOptions,
  SearchableSelect,
} from "../src/components/searchable-select";

const options = [
  {
    value: "business_1",
    label: "BlueLightBR",
    description: "business_1",
  },
  {
    value: "business_2",
    label: "Ag\u00eancia Barbieri",
    description: "business_2",
  },
];

describe("searchable select", () => {
  it("filters assets by an accent-insensitive name or Meta id", () => {
    expect(filterSearchableOptions(options, "agencia")).toEqual([options[1]]);
    expect(filterSearchableOptions(options, "business_1")).toEqual([
      options[0],
    ]);
  });

  it("keeps every option available when the current label receives focus", () => {
    expect(
      filterSearchableOptions(options, "BlueLightBR", "BlueLightBR"),
    ).toEqual(options);
  });

  it("submits the stable Meta id while exposing a searchable combobox", () => {
    const html = renderToStaticMarkup(
      createElement(SearchableSelect, {
        name: "businessId",
        value: "business_2",
        options,
        onValueChange: () => undefined,
        ariaLabel: "Business Manager",
        placeholder: "Buscar BM",
      }),
    );

    expect(html).toContain('name="businessId"');
    expect(html).toContain('value="business_2"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain("Ag\u00eancia Barbieri");
  });

  it("renders a neutral replacement for sensitive Meta assets", () => {
    const html = renderToStaticMarkup(
      createElement(SearchableSelect, {
        name: "businessId",
        value: "business_2",
        options,
        onValueChange: () => undefined,
        ariaLabel: "Business Manager",
        placeholder: "Buscar BM",
        presentationPlaceholder: "BM oculto",
        sensitive: true,
      }),
    );

    expect(html).toContain('data-presentation-sensitive="true"');
    expect(html).toContain('data-presentation-sensitive-field="true"');
    expect(html).toContain("BM oculto");
  });
});
