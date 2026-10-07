import { useId } from "react";
import { ExternalLink } from "lucide-react";
import { LEGAL_LINKS, LEGAL_ATTRIBUTION, type LegalLinkId } from "../shared/legal";
import { api } from "./api";
import { errorText } from "./errors";
import type { Translate } from "./i18n";
export function LegalSection({ t, notify }: { t: Translate; notify: (message: string, error?: boolean) => void }) {
  const headingId = useId();
  const text = (value: string) => value.replaceAll("{creator}", LEGAL_ATTRIBUTION.creator).replaceAll("{original}", LEGAL_ATTRIBUTION.originalCreator).replaceAll("{license}", LEGAL_ATTRIBUTION.license);
  const link = (id: LegalLinkId, label: string) => <a href={LEGAL_LINKS[id]} title={t("legalExternal")} onClick={(event) => { event.preventDefault(); void api("legal.openExternal", { linkId: id }).catch((error) => notify(errorText(error, t), true)); }}><span>{label}</span><ExternalLink size={13} aria-hidden="true" /><span className="sr-only"> · {t("legalExternal")}</span></a>;
  return <section className="panel settings-panel legal-panel" aria-labelledby={headingId}>
    <h2 id={headingId}>{t("legalTitle")}</h2>
    <section><h3>{t("legalAppTitle")}</h3><p>{t("legalApp")}</p><ul className="legal-links"><li>{link("softwareLicense", "MIT")}</li><li>{link("assetLicenses", t("legalArtTitle"))}</li><li>{link("thirdParty", t("legalThirdTitle"))}</li></ul></section>
    <section><h3>{t("legalArtTitle")}</h3><p><strong>{t("legalCreator")}: {LEGAL_ATTRIBUTION.creator}</strong></p>
      <ul className="legal-links"><li>{link("creator", t("legalProfile"))}</li>{(["videoAI", "videoBillion"] as const).map((id) => <li key={id}>{link(id, `${t("legalVideo")}: ${LEGAL_ATTRIBUTION.videos[id]}`)}</li>)}</ul>
      <p>{text(t("legalPermission"))}</p><h4>{t("legalWhaleTitle")}</h4><p>{text(t("legalWhale"))}</p>
      <ul className="legal-links"><li>{link("whaleOriginal", t("legalOriginal"))}</li><li>{link("ccSummary", t("legalCCSummary"))}</li><li>{link("ccLegal", t("legalCCText"))}</li></ul>
      <p>{t("legalScope")}</p><h4>{t("legalChangesTitle")}</h4><p>{t("legalChanges")}</p>
    </section><section><h3>{t("legalThirdTitle")}</h3><p>{t("legalThird")}</p></section>
  </section>;
}
