// Reproducibly rasterize our own vector icon with the bundled Chromium.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    webPreferences: { sandbox: true },
  });
  const svg = fs.readFileSync(
    path.join(__dirname, "../build/icon.svg"),
    "utf8",
  );
  await win.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(
        "<style>body{margin:0;background:transparent}svg{display:block;width:512px;height:512px}</style>" +
          svg,
      ),
  );
  const capture = await win.webContents.capturePage();
  fs.writeFileSync(
    path.join(__dirname, "../build/icon.png"),
    capture.resize({ width: 1024, height: 1024, quality: "best" }).toPNG(),
  );
  app.quit();
});
