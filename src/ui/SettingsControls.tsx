import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Settings } from "../shared/domain";
import type { Translate } from "./i18n";
import { useTab } from "./api";

// Dismiss presentation only: the settings draft continues to belong to SettingsView.
function usePopover() {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { active } = useTab();
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return {
    root, trigger, open, setOpen,
    onBlur: (event: React.FocusEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
      }
    },
  };
}

export function InitialsEditor({ label, avatar, children }: { label: string; avatar: ReactNode; children: ReactNode }) {
  const p = usePopover(), id = useId();
  return <div className="initials-editor" ref={p.root} onBlur={p.onBlur} onKeyDown={p.onKeyDown}>
    <button type="button" className="initials-trigger" ref={p.trigger} aria-label={label} aria-expanded={p.open} aria-controls={p.open ? id : undefined} onClick={() => p.setOpen(!p.open)}>{avatar}</button>
    {p.open && <div id={id} role="group" aria-label={label}>{children}</div>}
  </div>;
}

const themes = ["light", "dark", "system"] as const;
export function ThemeSelect({ value, onChange, t }: { value: Settings["theme"]; onChange: (value: Settings["theme"]) => void; t: Translate }) {
  const p = usePopover(), id = useId();
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const [highlight, setHighlight] = useState<number>(themes.indexOf(value));
  const [height, setHeight] = useState(180);
  useLayoutEffect(() => {
    if (!p.open) return;
    if (p.trigger.current && window.innerHeight - p.trigger.current.getBoundingClientRect().bottom < 140)
      p.trigger.current.scrollIntoView({ block: "center" });
    const position = () => setHeight(Math.max(40, Math.min(180, window.innerHeight - (p.trigger.current?.getBoundingClientRect().bottom ?? 0) - 12)));
    position();
    options.current[highlight]?.focus({ preventScroll: true });
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [p.open]);
  const show = (index = themes.indexOf(value)) => { setHighlight(index); p.setOpen(true); };
  return <div className="theme-field">
    <span id={`${id}-label`}>{t("theme")}</span>
    <div className="theme-select" ref={p.root} onBlur={p.onBlur} onKeyDown={(event) => {
      p.onKeyDown(event);
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === "Home" ? 0 : event.key === "End" ? 2 : p.open ? (highlight + (event.key === "ArrowUp" ? 2 : 1)) % 3 : themes.indexOf(value);
      if (!p.open) show(index);
      else { setHighlight(index); options.current[index]?.focus(); }
    }}>
      <button type="button" className="theme-trigger" ref={p.trigger} aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={p.open} aria-controls={p.open ? id : undefined} onClick={() => p.open ? p.setOpen(false) : show()}>
        <span id={`${id}-value`}>{t(value)}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      {p.open && <div className="theme-options" id={id} role="listbox" aria-labelledby={`${id}-label`} style={{ maxHeight: height }}>
        {themes.map((theme, index) => <button type="button" key={theme} ref={(el) => { options.current[index] = el; }} role="option" aria-selected={theme === value} tabIndex={highlight === index ? 0 : -1} onFocus={() => setHighlight(index)} onClick={() => { onChange(theme); p.setOpen(false); p.trigger.current?.focus(); }}>
          {t(theme)}{theme === value && <Check size={15} aria-hidden="true" />}
        </button>)}
      </div>}
    </div>
  </div>;
}
