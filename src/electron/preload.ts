import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("haicomo", {
  request: async (type: string, payload: unknown = {}) => {
    const response = await ipcRenderer.invoke("haicomo:request", type, payload);
    if (response.error) {
      const data =
        typeof response.error === "string"
          ? { message: response.error }
          : response.error;
      const error = new Error(data.message);
      Object.assign(error, data);
      throw error;
    }
    return response.result;
  },
  subscribe: (listener: (event: any) => void) => {
    const fn = (_: unknown, event: any) => listener(event);
    ipcRenderer.on("haicomo:event", fn);
    return () => ipcRenderer.removeListener("haicomo:event", fn);
  },
});
