"use client";

/**
 * Searchable combobox — shared by the entry page (foods + meals) and the
 * meal composer (foods). Full keyboard support: ↑/↓ highlight, Enter
 * selects, Escape closes. Selected value renders as a clearable chip.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export interface ComboOption {
  key: string;
  label: string;
}

export default function Combobox({
  options,
  placeholder,
  selectedLabel,
  onSelect,
  onClear,
  testId,
  maxResults = 50,
}: {
  options: ComboOption[];
  placeholder: string;
  /** When set, the combobox shows a selected chip instead of the input. */
  selectedLabel: string | null;
  onSelect: (key: string) => void;
  onClear: () => void;
  testId?: string;
  maxResults?: number;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
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
        role="combobox"
        aria-expanded={open}
        data-testid={testId}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && (
        <div className="combobox-menu" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="combobox-empty">No matches</div>
          ) : (
            filtered.map((opt, i) => (
              <div
                key={opt.key}
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
            ))
          )}
        </div>
      )}
    </div>
  );
}
