import { Sparkles, UserRound } from "lucide-react";
import type { Settings } from "../shared/domain";
import { initials } from "../shared/settings";
import type { Translate } from "./i18n";
export function UserAvatar({ settings, t }: { settings: Settings; t: Translate }) {
  const letters = initials(settings.userName, settings.avatarInitials);
  return <span className={`user-avatar ${letters.length === 4 ? "initials-four" : ""}`} title={settings.userName || t("actorHuman")} aria-label={settings.userName || t("actorHuman")}>
    {letters.length ? letters.map((letter, i) => <span key={i}>{letter}</span>) : <UserRound size={16} aria-hidden="true" />}
  </span>;
}
export function ModeToggle({ enhanced, t, onClick, compact = false }: { enhanced: boolean; t: Translate; onClick: () => void; compact?: boolean }) {
  return <button className={compact ? "icon-button" : "button"} title={t("enhanced")} aria-label={t("enhanced")} aria-pressed={enhanced} onClick={onClick}>
    <Sparkles size={17} fill={enhanced ? "currentColor" : "none"} aria-hidden="true" />{!compact && t(enhanced ? "enhancedMode" : "defaultMode")}
  </button>;
}
