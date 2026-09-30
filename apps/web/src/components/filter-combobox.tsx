"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { normalizeSearchText } from "../lib/search-text";

export type FilterComboboxOption = {
  value: string;
  label: string;
  /** Second line (meta), also searchable. */
  description?: string;
  /** Group key; options without a known group render above the groups. */
  group?: string;
  /** Full name when `label` is truncated; also searchable. */
  title?: string;
};

export type FilterComboboxGroup = { key: string; label: string };

export type FilterComboboxCopy = {
  /** First row and trigger text when nothing is selected. */
  all: string;
  searchPlaceholder: string;
  searchLabel: string;
  count: (matches: number, total: number) => string;
  found: (matches: number) => string;
  noResults: (query: string) => string;
  clearSearch: string;
};

type FilterComboboxProps = {
  /** Phase C adds "multi"; the value is already a list for that. */
  mode?: "single";
  name: string;
  label: string;
  value: string[];
  options: FilterComboboxOption[];
  groups?: FilterComboboxGroup[];
  onCommit: (next: string[]) => void;
  copy: FilterComboboxCopy;
  /** Renders a disabled trigger with this text (e.g. options failed). */
  disabledLabel?: string;
  /** Presentation mode: no names in the DOM, only this placeholder. */
  presentationPlaceholder?: string;
  className?: string;
};

export type FilterComboboxSection = {
  key: string;
  label?: string;
  options: FilterComboboxOption[];
};

/** Accent- and case-insensitive substring over label, title, meta and id. */
export function filterComboboxOptions(
  options: FilterComboboxOption[],
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) =>
    normalizeSearchText(
      [option.label, option.title, option.description, option.value]
        .filter(Boolean)
        .join(" "),
    ).includes(normalizedQuery),
  );
}

/** Ungrouped options first, then groups in the given order; empty ones hidden. */
export function sectionComboboxOptions(
  options: FilterComboboxOption[],
  groups: FilterComboboxGroup[] = [],
): FilterComboboxSection[] {
  const known = new Set(groups.map((group) => group.key));
  const sections: FilterComboboxSection[] = [
    {
      key: "",
      options: options.filter(
        (option) => !option.group || !known.has(option.group),
      ),
    },
    ...groups.map((group) => ({
      key: group.key,
      label: group.label,
      options: options.filter((option) => option.group === group.key),
    })),
  ];

  return sections.filter((section) => section.options.length > 0);
}

export function FilterCombobox({
  name,
  label,
  value,
  options,
  groups,
  onCommit,
  copy,
  disabledLabel,
  presentationPlaceholder,
  className,
}: FilterComboboxProps) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const triggerId = `${baseId}-trigger`;
  const listboxId = `${baseId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedValue = value[0] ?? "";
  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );
  const hasQuery = normalizeSearchText(query) !== "";
  const matches = useMemo(
    () => filterComboboxOptions(options, query),
    [options, query],
  );
  const sections = useMemo(
    () => sectionComboboxOptions(matches, groups),
    [groups, matches],
  );
  // Flat, rendered order: what the arrows walk through.
  const rows = useMemo<FilterComboboxOption[]>(
    () => [
      ...(hasQuery ? [] : [{ value: "", label: copy.all }]),
      ...sections.flatMap((section) => section.options),
    ],
    [copy.all, hasQuery, sections],
  );
  const rowId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    if (isOpen) {
      searchRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      document
        .getElementById(`${listboxId}-option-${activeIndex}`)
        ?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeIndex, isOpen, listboxId]);

  function open(seed = "") {
    const seededRows = seed
      ? filterComboboxOptions(options, seed)
      : [
          { value: "" },
          ...sectionComboboxOptions(options, groups).flatMap(
            (section) => section.options,
          ),
        ];
    const selectedIndex = seed
      ? -1
      : seededRows.findIndex((row) => row.value === selectedValue);

    setQuery(seed);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  }

  function close(focusTrigger: boolean) {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(-1);

    if (focusTrigger) {
      triggerRef.current?.focus();
    }
  }

  function select(option: FilterComboboxOption) {
    close(true);

    if (option.value !== selectedValue) {
      onCommit(option.value ? [option.value] : []);
    }
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    setActiveIndex(0);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open();
    } else if (
      event.key.length === 1 &&
      event.key !== " " &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      open(event.key);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const last = rows.length - 1;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => (current >= last ? 0 : current + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => (current <= 0 ? last : current - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(rows.length > 0 ? 0 : -1);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(last);
        break;
      case "Enter":
        // Never submit the surrounding form from the search box.
        event.preventDefault();
        if (rows[activeIndex]) {
          select(rows[activeIndex]);
        }
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  const rootClassName = `filter-field filter-combobox${
    className ? ` ${className}` : ""
  }`;

  if (presentationPlaceholder !== undefined) {
    return (
      <div className={rootClassName}>
        <span>{label}</span>
        <input type="hidden" name={name} value={selectedValue} />
        <span className="presentation-filter-placeholder">
          {presentationPlaceholder}
        </span>
      </div>
    );
  }

  if (disabledLabel !== undefined) {
    return (
      <div className={rootClassName}>
        <span id={labelId}>{label}</span>
        {/* A disabled control keeps an applied cut in the form. */}
        {selectedValue ? (
          <input type="hidden" name={name} value={selectedValue} />
        ) : null}
        <button
          className="filter-combobox-trigger"
          type="button"
          id={triggerId}
          aria-labelledby={`${labelId} ${triggerId}`}
          disabled
        >
          <span className="filter-combobox-value">{disabledLabel}</span>
        </button>
      </div>
    );
  }

  const triggerText = selectedOption?.label ?? copy.all;
  let rowIndex = hasQuery ? 0 : 1;

  return (
    <div
      className={rootClassName}
      data-open={isOpen ? "true" : undefined}
      onBlur={(event) => {
        if (
          isOpen &&
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          close(false);
        }
      }}
    >
      <span id={labelId}>{label}</span>
      <input type="hidden" name={name} value={selectedValue} />
      <button
        ref={triggerRef}
        className="filter-combobox-trigger"
        type="button"
        id={triggerId}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-labelledby={`${labelId} ${triggerId}`}
        title={selectedOption?.title ?? triggerText}
        onClick={() => (isOpen ? close(true) : open())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="filter-combobox-value">{triggerText}</span>
      </button>

      {isOpen ? (
        <div className="filter-combobox-popover">
          <input
            ref={searchRef}
            className="filter-combobox-search"
            type="text"
            role="combobox"
            aria-label={copy.searchLabel}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-activedescendant={
              activeIndex >= 0 && rows[activeIndex]
                ? rowId(activeIndex)
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
            placeholder={copy.searchPlaceholder}
            value={query}
            onChange={(event) => handleQueryChange(event.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {hasQuery ? (
            <span className="filter-combobox-count">
              {copy.count(matches.length, options.length)}
            </span>
          ) : null}
          <div
            className="filter-combobox-list"
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
          >
            {hasQuery ? null : renderRow({ value: "", label: copy.all }, 0)}
            {sections.map((section) => {
              const renderedRows = section.options.map((option) =>
                renderRow(option, rowIndex++),
              );

              if (!section.label) {
                return renderedRows;
              }

              const groupLabelId = `${listboxId}-group-${section.key}`;

              return (
                <div
                  key={section.key}
                  className="filter-combobox-group"
                  role="group"
                  aria-labelledby={groupLabelId}
                >
                  <span
                    className="micro-label filter-combobox-group-label"
                    id={groupLabelId}
                    role="presentation"
                  >
                    {section.label}
                  </span>
                  {renderedRows}
                </div>
              );
            })}
          </div>
          {hasQuery && matches.length === 0 ? (
            <div className="filter-combobox-empty">
              <span>{copy.noResults(query.trim())}</span>
              <button
                type="button"
                className="filter-combobox-clear"
                onClick={() => {
                  handleQueryChange("");
                  searchRef.current?.focus();
                }}
              >
                {copy.clearSearch}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        {isOpen && hasQuery ? copy.found(matches.length) : ""}
      </span>
    </div>
  );

  function renderRow(option: FilterComboboxOption, index: number) {
    const selected = option.value === selectedValue;

    return (
      <div
        className={`filter-combobox-option${
          index === activeIndex ? " active" : ""
        }`}
        id={rowId(index)}
        key={option.value || "__all__"}
        role="option"
        aria-selected={selected}
        title={option.title}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => select(option)}
      >
        <strong>{option.label}</strong>
        {option.description ? <span>{option.description}</span> : null}
      </div>
    );
  }
}
