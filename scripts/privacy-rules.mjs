// Report categories and paths only, never matching credential contents.
export const privatePath = /(^|\/)(?:validation|handoff|legacy|public|private|local-reference|\.signing|\.haicomo|\.haicomo-history)(\/|$)|(?:\.haicomo(?:\.zip)?|\.sqlite(?:-.*)?|\.db|\.p8|\.p12|\.pfx|\.pem|\.key|\.cer|\.crt|\.csr|\.certSigningRequest|\.keychain(?:-db)?|\.mobileprovision|\.provisionprofile|\.log)$|(^|\/)\.env(?:\.|$)|(^|\/)signing\.local\.|(^|\/)prd_draft\.md$/i;
export const credentialPattern = /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{32,}|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{32,})\b/;
export const personalPath = /(?:\/Users\/(?!example\/|user\/|name\/|runner\/)[A-Za-z0-9._-]+\/|[A-Z]:[\\/]Users[\\/](?!example[\\/]|user[\\/]|name[\\/]|runneradmin[\\/]|runner[\\/]|haicomo-ci[\\/])[A-Za-z0-9._-]+[\\/])/i;
export function privacyIssues(file, text, { dependency = false } = {}) {
  const issues = [];
  if (!dependency && privatePath.test(file)) issues.push('private/generated path');
  if (credentialPattern.test(text)) issues.push('credential pattern');
  if (!dependency && personalPath.test(text)) issues.push('personal absolute path');
  return issues;
}
