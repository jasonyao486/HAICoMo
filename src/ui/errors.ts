import { errorData } from "../shared/errors";
import type { Translate, Key } from "./i18n";
const keys: Record<string, Key> = {
  AUDIT_NOT_FOUND: "errAuditNotFound",
  ARTIFACT_FOREIGN_ABSOLUTE_PATH: "errExternalArtifact",
  LEGAL_LINK_NOT_ALLOWED: "legalInvalidLink",
  LEGAL_LINK_OPEN_FAILED: "legalOpenFailed",
  SETTINGS_CONFLICT: "settingsConflict",
  INITIALS_TOO_LONG: "initialsInvalid",
  UPDATE_BUSY: "updateBusy",
  STOP_AGENTS_BEFORE_UPDATE: "updateActiveRuns",
  UPDATE_NOT_DOWNLOADED: "updateNotReady",
  UPDATE_PREPARATION_FAILED: "updateSaveFailed",
  UPDATE_HTTPS_REQUIRED: "updateInvalidSource",
  UPDATE_IN_PROGRESS: "updateFrozen",
  ENTRY_NOT_FOUND: "entryNotFound",
  ENTRY_ALREADY_EXISTS: "entryExists",
  PROJECT_ALREADY_EXISTS: "entryExists",
  PROJECT_REPLACED: "projectReplaced",
  ENTRY_IDENTITY_MISMATCH: "projectReplaced",
  PROJECT_HAS_ACTIVE_RUNS: "activeBlocksCreate",
  REVISION_CONFLICT: "errRevisionConflict",
  TASK_BLOCKED: "errTaskBlocked",
  NOT_DELIVERED: "errNotDelivered",
  UNFINISHED_PREREQUISITES_OR_CHILDREN: "errUnfinished",
  ARCHIVE_CHILDREN_FIRST: "errArchiveChildren",
  ARCHIVE_BEFORE_DELETE: "errArchiveBeforeDelete",
  TASK_REFERENCED: "errTaskReferenced",
  DEPENDENCY_CYCLE: "errDependencyCycle",
  INVALID_DATE_RANGE: "errInvalidDateRange",
  ALREADY_REVIEWED: "errAlreadyReviewed",
  PROPOSAL_DEPENDENCY_UNRESOLVED: "errProposalDependency",
  SESSION_ALREADY_RUNNING: "errSessionRunning",
  BACKGROUND_UNSUPPORTED: "errBackgroundUnsupported",
  EFFORT_UNSUPPORTED_FOR_MODEL: "errEffortUnsupported",
  MODE_UNSUPPORTED: "errModeUnsupported",
  PROJECT_LOCKED: "errProjectLocked",
  PROJECT_LOCKED_OTHER_HOST: "errProjectLockedOtherHost",
  DUPLICATE_PROJECT: "errDuplicateProject",
  RUN_NOT_FOUND: "errRunNotFound",
  RUN_NOT_ACTIVE: "errRunNotFound",
  PROMPT_REQUIRED: "errPromptRequired",
  TASK_NOT_FOUND: "errTaskNotFound",
  TASK_ARCHIVED: "errTaskArchived",
  DATABASE_TIMEOUT: "errDatabaseTimeout",
  RELAY_NOT_FOUND: "errRelayNotFound",
  RELAY_NOT_EDITABLE: "errRelayNotEditable",
  RELAY_NOT_SCHEDULED: "errRelayNotEditable",
  RELAY_NOT_FIRING: "errRelayNotEditable",
  RELAY_BUSY: "errRelayBusy",
  RELAY_CHAIN_FORBIDDEN: "errRelayChain",
  RELAY_TIME_PAST: "errRelayTimePast",
  RELAY_TIME_TOO_FAR: "errRelayTimeTooFar",
  RELAY_THREAD_PROVIDER_MISMATCH: "errRelayThreadProvider",
  PREDECESSOR_NOT_FOUND: "errPredecessorNotFound",
  PREDECESSOR_NOT_RUNNER: "errPredecessorNotFound",
  LOCK_NOT_FOREIGN: "errLockNotForeign",
  PROJECT_ALREADY_OPEN: "errProjectAlreadyOpen",
};
// Unmapped errors keep their original text: a diagnostic message is never replaced by a generic label.
// Codes whose details are structured data for a dialog, not text for a toast.
const structured = new Set(["PROJECT_LOCKED_OTHER_HOST", "PROJECT_LOCKED"]);
export function errorText(error: unknown, t: Translate) {
  const data = errorData(error);
  if (!keys[data.code]) return data.message;
  const details = data.details && !structured.has(data.code) && !data.details.startsWith("{") ? `\n${data.details}` : "";
  return `${t(keys[data.code])}${details}`;
}
/** Structured details carried by lock errors, when present. */
export function lockDetails(error: unknown): { hostname?: string; pid?: number; at?: string | null; app?: string | null } | null {
  const data = errorData(error);
  if (!structured.has(data.code) || !data.details) return null;
  try { return JSON.parse(data.details); } catch { return null; }
}
