import React from "react";
import { createRoot } from "react-dom/client";
import { Tabs } from "./Tabs";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Tabs />
  </React.StrictMode>,
);
