"use client";

/**
 * Searchable combobox — shared by the entry page (foods + meals) and the
 * meal composer (foods). Full keyboard support: ↑/↓ highlight, Enter
 * selects, Escape closes. Selected value renders as a clearable chip.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

export interface ComboOption {
  key: string;
  label: string;
  /** Optional group heading; pinned sections (e.g. "Recent") render first. */
  section?: string;
}

export default function Combobox({
  options,
  placeholder,
  selectedLabel,
  onSelect,
  onClear,
  onQuickAdd,
  onQueryChange,
  onCancel,
  testId,
  maxResults = 50,
  inputRef,
  startOpen = false,
}: {
  options: ComboOption[];
  placeholder: string;
  /** When set, the combobox shows a selected chip instead of the input. */
  selectedLabel: string | null;
  onSelect: (key: string) => void;
  onClear: () => void;
  /** When provided, a no-match search offers "+ Quick add <query>". */
  onQuickAdd?: (query: string) => void;
  /** Fires as the user edits the search text (lets the parent react to typing). */
  onQueryChange?: (query: string) => void;
  /** Embedded mode: called on Escape / click-away so the parent can dismiss. */
  onCancel?: () => void;
  testId?: string;
  maxResults?: number;
  /** Lets the parent re-focus the search input (e.g. after a successful add). */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Embedded mode: open the menu immediately and autofocus the input. */
  startOpen?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(startOpen);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? options.filter((o) => o.label.toLowerCase().includes(q))
      : options;
    return matches.slice(0, maxResults);
  }, [options, query, maxResults]);

  // Section headers only show on the un-searched list; typing collapses to a
  // flat substring match so a recent food still surfaces by name.
  const showSections = query.trim() === "" && filtered.some((o) => o.section);

  // keep highlight in range as the list filters down
  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  // keep the highlighted option scrolled into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${highlight}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  function choose(key: string) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(false);
    setQuery("");
    onSelect(key);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[highlight]) choose(filtered[highlight].key);
    } else if (e.key === "Escape") {
      setOpen(false);
      onCancel?.();
    }
  }

  if (selectedLabel !== null) {
    return (
      <div className="combobox">
        <div className="combobox-chip" data-testid={testId ? `${testId}-chip` : undefined}>
          <span className="combobox-chip-label">{selectedLabel}</span>
          <button
            type="button"
            className="delete-icon"
            aria-label="Clear selection"
            onClick={onClear}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="combobox">
      <input
        type="text"
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        data-testid={testId}
        placeholder={placeholder}
        value={query}
        autoFocus={startOpen}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
          onQueryChange?.(e.target.value);
        }}
        // open on user intent (click/typing/arrows) — NOT on programmatic
        // focus, which would pop the menu over the page after every add
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          blurTimer.current = setTimeout(() => {
            setOpen(false);
            onCancel?.();
          }, 150);
        }}
      />
      {open && (
        <div className="combobox-menu" ref={listRef}>
          {filtered.length === 0 ? (
            onQuickAdd && query.trim() ? (
              <div
                className="combobox-option combobox-quick-add focused"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const q = query.trim();
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  setOpen(false);
                  setQuery("");
                  onQuickAdd(q);
                }}
              >
                + Quick add &ldquo;{query.trim()}&rdquo;
              </div>
            ) : (
              <div className="combobox-empty">No matches</div>
            )
          ) : (
            filtered.map((opt, i) => {
              // On the un-searched list, print a heading when the section
              // changes. Highlight/data-index still track selectable options.
              const header =
                showSections && opt.section !== filtered[i - 1]?.section ? (
                  <div className="combobox-section-header" key={`hdr:${opt.key}`}>
                    {opt.section}
                  </div>
                ) : null;
              return (
                <Fragment key={opt.key}>
                  {header}
                  <div
                    data-index={i}
                    className={`combobox-option${i === highlight ? " focused" : ""}`}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(opt.key);
                    }}
                  >
                    {opt.label}
                  </div>
                </Fragment>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
