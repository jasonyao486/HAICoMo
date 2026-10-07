import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { Workspace } from "../shared/domain";
declare global {
  interface Window {
    haicomo: {
      request: (type: string, payload?: unknown) => Promise<any>;
      subscribe: (fn: (event: any) => void) => () => void;
    };
  }
}
export const api = (type: string, payload: unknown = {}) =>
  window.haicomo.request(type, payload);
export type DirtyGuard = { dirty: boolean; save: () => Promise<void> };
export const TabContext = createContext({
  id: "",
  active: true,
  initialPage: "overview",
  reportPage: (_: string) => {},
  workspace: null as Workspace | null,
  attach: (_: Workspace) => {},
  newTab: () => {},
  switcher: null as import("react").ReactNode,
  reportTitle: (_: string) => {},
  register: (_: string, __: DirtyGuard | null) => {},
});
export const useTab = () => useContext(TabContext);
export function useApi() {
  const { workspace } = useTab();
  const binding = workspace?.binding,
    entryPath = workspace?.entryPath;
  return useMemo(() => {
    const request = async (type: string, payload: any = {}) => {
      const result = await api(type, {
        ...payload,
        ...(binding ? { binding } : {}),
      });
      if (result?.state?.tasks)
        return {
          ...result,
          binding: result.binding ?? binding,
          entryPath: result.entryPath ?? entryPath,
        };
      return result;
    };
    return {
      api: request,
      command: (type: string, payload: unknown) =>
        request("project.command", { id: crypto.randomUUID(), type, payload }),
    };
  }, [binding, entryPath]);
}
export function useDirty(dirty: boolean, save: () => Promise<void>) {
  const tab = useTab(),
    id = useRef(crypto.randomUUID()),
    latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    tab.register(id.current, { dirty, save: () => latest.current() });
    return () => tab.register(id.current, null);
  }, [dirty, tab.register]);
}
