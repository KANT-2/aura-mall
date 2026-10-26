"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { testIds } from "@/lib/test-ids";

type SelectOption = { value: string; label: string };
type SelectProps = {
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  options: SelectOption[];
  testId?: string;
};

export function StyledSelect({ label, value, onChange, name, options, testId }: SelectProps) {
  const [internal, setInternal] = useState(options[0]?.value ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const current = value ?? internal;
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  function choose(index: number) {
    const next = options[index].value;
    setInternal(next);
    onChange?.(next);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setActive(
          Math.max(
            0,
            options.findIndex((option) => option.value === current),
          ),
        );
        setOpen(true);
      } else {
        setActive(
          (index) =>
            (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length,
        );
      }
    }

    if (event.key === "Home" && open) {
      event.preventDefault();
      setActive(0);
    }

    if (event.key === "End" && open) {
      event.preventDefault();
      setActive(options.length - 1);
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        choose(active);
      } else {
        setOpen(true);
      }
    }

    if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div
      className="a-select"
      ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      {name && <input type="hidden" name={name} value={current} />}
      <button
        data-testid={testId}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => {
          setActive(
            Math.max(
              0,
              options.findIndex((option) => option.value === current),
            ),
          );
          setOpen(!open);
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{options.find((option) => option.value === current)?.label || label}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div role="listbox" id={id} aria-label={label} className="a-select-list">
          {options.map((option, index) => (
            <button
              data-testid={testId ? testIds.option(testId, option.value) : undefined}
              type="button"
              role="option"
              tabIndex={-1}
              id={`${id}-${index}`}
              aria-selected={option.value === current}
              className={index === active ? "active" : ""}
              key={option.value}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              onMouseEnter={() => setActive(index)}
            >
              {option.label}
              <span aria-hidden="true">{option.value === current ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
