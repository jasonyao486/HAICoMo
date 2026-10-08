import { useEffect, useState } from "react";
import type { Workspace } from "../shared/domain";
import { assertAgentConnection, composeAgentPrompt, connectionText } from "../shared/agent-prompt";
import { useApi } from "./api";
import { Modal } from "./components";
import type { Translate } from "./i18n";
import { errorText } from "./errors";

export function ConnectAgent({ workspace, t, onClose }: { workspace: Workspace; t: Translate; onClose: () => void }) {
  const { api } = useApi();
  const text = connectionText(t.locale);
  const [current, setCurrent] = useState(workspace);
  const [taskId, setTaskId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCurrent(workspace); }, [workspace]);
  let prompt = "", invalid = "";
  try {
    assertAgentConnection(current, taskId);
    prompt = composeAgentPrompt(current.directory, current.state, t.locale, taskId || undefined);
  } catch (e) { invalid = errorText(e, t); }
  const copy = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const fresh: Workspace = await api("project.view");
      setCurrent(fresh);
      assertAgentConnection(fresh, taskId);
      const next = composeAgentPrompt(fresh.directory, fresh.state, t.locale, taskId || undefined);
      if (next !== prompt) throw new Error("AGENT_CONTEXT_CHANGED");
      await api("clipboard", { text: next });
      setMessage(t("copied"));
    } catch (e) { setError(errorText(e, t)); }
    finally { setBusy(false); }
  };
  return <Modal title={text.connect} onClose={onClose} closeLabel={t("close")} wide>
    <div className="modal-body connection-form">
      <p className="muted">{text.hint}</p>
      <label>{t("workingDirectory")}<input readOnly value={current.directory} /></label>
      <label>{text.scope}<select value={taskId} onChange={(e) => { setTaskId(e.target.value); setMessage(""); setError(""); }}>
        <option value="">{text.project}</option>
        {current.state.tasks.filter((task) => !task.archived).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
      </select></label>
      <label>{text.preview}<textarea readOnly rows={13} value={prompt} /></label>
      {(invalid || error) && <div className="error-box" role="alert">{invalid || error}</div>}
      {message && <div className="notice" role="status">{message}</div>}
    </div>
    <div className="modal-footer"><button className="button primary" disabled={busy || !!invalid} onClick={() => void copy()}>{text.copy}</button></div>
  </Modal>;
}
