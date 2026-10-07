import { useTab } from "./api";
import { useEffect, useRef, useState } from "react";
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  Rectangle,
  TilingSprite,
} from "pixi.js";
import "pixi.js/unsafe-eval";
import {
  COLORS,
  FAMILIES,
  aggregateFamily,
  familyName,
  officeActors,
  topTask,
  type Family,
  type ProjectState,
  type Settings,
} from "../shared/domain";
import { CHARACTERS, FURNITURE, frameAt, type Pose } from "../shared/art";
import { FIGURE_HEAD, figureHeadRotation, figureSegments } from "../shared/figure";
import {
  officeLayout,
  reserveSeat,
  route,
  clearSegment,
  type Point,
} from "../shared/office";
import { clientIcon, isClientActor } from "../shared/clients";
import { Avatar, Badge } from "./components";
import type { Translate } from "./i18n";

type Memory = Point & { seat: number; lastSwitch: number };
export function Office({
  state,
  settings,
  t,
  onSelect,
}: {
  state: ProjectState;
  settings: Settings;
  t: Translate;
  onSelect: (actor: string) => void;
}) {
  const tab = useTab();
  const activeTab = useRef(tab.active);
  activeTab.current = tab.active;
  const pause = useRef<() => void>(() => {});
  useEffect(() => pause.current(), [tab.active]);
  const host = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    latest = useRef(state),
    select = useRef(onSelect),
    memories = useRef(new Map<string, Memory>()),
    clock = useRef(0);
  latest.current = state;
  select.current = onSelect;
  const [failed, setFailed] = useState(""),
    [zoom, setZoom] = useState(1);
  const actors = officeActors(state);
  const signature =
    state.tasks
      .filter((task) => !task.parentId && !task.archived && task.tableVisible)
      .map((task) => task.id + ":" + task.title)
      .join("|") + actors.join("|");
  useEffect(() => {
    const app = new Application();
    let disposed = false,
      ready = false,
      cleanup = () => {};
    setFailed("");
    const tops = latest.current.tasks.filter(
        (task) => !task.parentId && !task.archived && task.tableVisible,
      ),
      ids = officeActors(latest.current),
      layout = officeLayout(
        tops.map((task) => task.id),
        ids.length,
      ),
      enhanced = settings.enhanced;
    const tables = new Map(layout.tables.map((table) => [table.id, table])),
      obstacles = [
        ...layout.tables,
        ...layout.teas,
        ...layout.benches,
        ...layout.plants,
      ];
    const setup = async () => {
      // The viewport is bounded; world height may contain thousands of task desks.
      await app.init({
        width: layout.width,
        height: 740,
        backgroundAlpha: 0,
        antialias: true,
        preference: "webgl",
        resolution: Math.min(devicePixelRatio, 2),
        autoDensity: true,
      });
      ready = true;
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      const element = host.current!,
        scroll = viewport.current!;
      delete element.dataset.officeMetrics;
      element.replaceChildren(app.canvas);
      Object.assign(app.canvas.style, {
        width: "100%",
        height: "auto",
        position: "sticky",
        top: "0px",
        display: "block",
      });
      app.canvas.setAttribute("aria-label", t("office"));
      app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      app.canvas.addEventListener("webglcontextlost", (e) => {
        if (!disposed) {
          e.preventDefault();
          app.ticker.stop();
          setFailed(t("renderFailed"));
        }
      });
      const scene = new Container(),
        depth = new Container(),
        labels = new Container();
      depth.sortableChildren = true;
      app.stage.addChild(scene);
      const bg = new Graphics();
      scene.addChild(bg);
      bg.rect(0, 0, layout.width, layout.height).fill(
        enhanced ? 0xead6b9 : 0xeef1ed,
      );
      const furnitureTextures: Record<string, Texture> = {};
      if (enhanced) {
        await Promise.all(
          Object.entries(FURNITURE).map(async ([id, meta]) => {
            furnitureTextures[id] = await Assets.load(meta.src);
          }),
        );
        const floorTexture = await Assets.load<Texture>(
            "./local-assets/studio-floor.png",
          ),
          wallTexture = await Assets.load<Texture>(
            "./local-assets/studio-wall.png",
          );
        if (disposed) return;
        const floor = new TilingSprite({
          texture: floorTexture,
          width: layout.width,
          height: layout.height,
        });
        floor.tileScale.set(0.35);
        scene.addChild(floor);
        for (let x = 0; x < layout.width; x += 374) {
          const wall = new Sprite(wallTexture);
          wall.position.set(x, 0);
          wall.width = 375;
          wall.height = 145;
          scene.addChild(wall);
        }
      } else {
        bg.rect(0, 0, layout.width, 144)
          .fill(0xe0e7df)
          .rect(0, 136, layout.width, 10)
          .fill(0xc7d2c9);
        for (let y = 146; y < layout.height; y += 44)
          bg.moveTo(0, y)
            .lineTo(layout.width, y)
            .stroke({ color: 0xdce4dc, width: 1 });
        for (let i = 0; i < 3; i++) {
          const x = 100 + i * 380;
          bg.roundRect(x, 20, 150, 88, 9)
            .fill(0xf9fcf7)
            .rect(x + 8, 28, 134, 72)
            .fill(0xdae8e2)
            .moveTo(x + 75, 28)
            .lineTo(x + 75, 100)
            .moveTo(x + 8, 64)
            .lineTo(x + 142, 64)
            .stroke({ color: 0xf8faf7, width: 4 });
        }
      }
      scene.addChild(depth, labels);
      const label = (value: string, x: number, y: number, size = 12) => {
        const text = new Text({
          text: value,
          style: {
            fontFamily: "system-ui,sans-serif",
            fontSize: size,
            fill: 0x4e5d50,
          },
        });
        text.anchor.set(0.5, 0);
        text.position.set(x, y);
        labels.addChild(text);
        return text;
      };
      const objects: { node: Container; y: number }[] = [];
      const furniture = (
        kind: keyof typeof FURNITURE,
        x: number,
        y: number,
        z = y,
      ) => {
        const node = new Container();
        node.position.set(x, y);
        node.zIndex = z;
        if (enhanced) {
          const meta = FURNITURE[kind],
            sprite = new Sprite(furnitureTextures[kind]);
          sprite.anchor.set(meta.anchor[0], meta.anchor[1]);
          sprite.width = meta.width;
          sprite.height = meta.height;
          node.addChild(sprite);
        } else {
          const g = new Graphics();
          node.addChild(g);
          if (kind === "table")
            g.ellipse(0, 22, 102, 43)
              .fill({ color: 0x293c31, alpha: 0.08 })
              .roundRect(-9, 0, 18, 42, 4)
              .fill(0xadc0b1)
              .ellipse(0, 0, 98, 47)
              .fill(0xb1c3b5)
              .ellipse(0, -6, 98, 43)
              .fill(0xdfe9de);
          if (kind === "bench")
            g.roundRect(-24, -8, 48, 18, 5)
              .fill(0xadc0b1)
              .roundRect(-24, -14, 48, 13, 5)
              .fill(0xd4dfd5);
          if (kind === "tea")
            g.rect(-4, -2, 8, 28)
              .fill(0xadc0b1)
              .ellipse(0, -2, 29, 19)
              .fill(0xd4dfd5);
          if (kind === "plant") {
            g.roundRect(-12, -15, 24, 27, 5).fill(0xb7c9b8);
            for (let i = 0; i < 5; i++)
              g.ellipse(Math.sin(i * 1.7) * 12, -25 - i * 3, 9, 17).fill(
                0x8eac94,
              );
          }
        }
        depth.addChild(node);
        objects.push({ node, y });
        return node;
      };
      layout.seats.forEach((p) => furniture("bench", p.x, p.y, p.y - 2));
      layout.teas.forEach((p) => furniture("tea", p.x, p.y, p.y + 22));
      layout.tables.forEach((p, i) => {
        furniture("table", p.x, p.y, p.y + p.ry);
        const text = label(
          tops[i].title.length > 26
            ? tops[i].title.slice(0, 26) + "…"
            : tops[i].title,
          p.x,
          p.y + (enhanced ? 123 : 91),
          13,
        );
        objects.push({ node: text, y: p.y + 123 });
      });
      layout.plants.forEach((p) => furniture("plant", p.x, p.y));
      const atlases: Record<string, Texture[]> = {},
        logos: Record<string, Texture> = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            logos[id] = await Assets.load(
              isClientActor(id)
                ? `.${clientIcon(id.slice(7))}`
                : `./local-assets/${id}-logo.svg`,
            );
          } catch {}
          const manifest = CHARACTERS[id as Family];
          if (enhanced && manifest) {
            const texture = await Assets.load<Texture>(manifest.src);
            atlases[id] = Array.from(
              { length: manifest.columns * manifest.rows },
              (_, i) =>
                new Texture({
                  source: texture.source,
                  frame: new Rectangle(
                    ...(manifest.regions?.[i] ??
                      ([
                        ((i % manifest.columns) * texture.width) /
                          manifest.columns,
                        (Math.floor(i / manifest.columns) * texture.height) /
                          manifest.rows,
                        texture.width / manifest.columns,
                        texture.height / manifest.rows,
                      ] as [number, number, number, number])),
                  ),
                }),
            );
          }
        }),
      );
      if (disposed) {
        Object.values(atlases)
          .flat()
          .forEach((texture) => texture.destroy(false));
        return;
      }
      const reserved = new Map<number, string>();
      for (const id of ids) {
        const old = memories.current.get(id);
        if (old && layout.seats[old.seat] && !reserved.has(old.seat))
          reserved.set(old.seat, id);
      }
      const agents = ids.map((id, i) => {
        const container = new Container(),
          body = new Graphics(),
          head = new Sprite(logos[id] ?? Texture.WHITE),
          manifest = CHARACTERS[id as Family];
        const art = atlases[id]
          ? new Sprite(atlases[id][manifest.motions.idle.frames[0]])
          : null;
        if (art) {
          art.anchor.set(...manifest.anchor);
          art.scale.set(manifest.height / art.texture.height);
          container.addChild(art);
        } else {
          container.addChild(body);
          head.anchor.set(0.5);
          head.width = 25;
          head.height = 25;
          head.position.set(0, FIGURE_HEAD.y);
          container.addChild(head);
        }
        const name = new Text({
          text: familyName(id),
          style: {
            fontFamily: "system-ui",
            fontSize: 10,
            fill: 0x3f5145,
            fontWeight: "600",
          },
        });
        name.anchor.set(0.5, 0);
        name.y = 9;
        container.addChild(name);
        const bubble = new Text({
          text: "",
          style: {
            fontFamily: "system-ui",
            fontSize: 12,
            fill: 0x425c60,
            fontWeight: "600",
            stroke: { color: 0xffffff, width: 3 },
          },
        });
        bubble.anchor.set(0.5, 1);
        bubble.position.set(23, -68);
        container.addChild(bubble);
        const old = memories.current.get(id),
          initial = old && old.y < layout.height ? old : layout.seats[i];
        container.position.set(initial.x, initial.y);
        container.eventMode = "static";
        container.cursor = "grab";
        container.hitArea = new Rectangle(-36, -85, 72, 100);
        depth.addChild(container);
        const a = {
          id,
          i,
          container,
          art,
          body,
          head,
          bubble,
          seat: reserveSeat(id, container, layout.seats, reserved),
          dragging: false,
          path: [] as Point[],
          goal: { x: -1, y: -1 },
          ignore: "",
          nextPath: 0,
          lastSwitch: old?.lastSwitch ?? i,
          lastPose: "",
        };
        container.on("rightclick", () => select.current(id));
        container.on("pointerdown", (e) => {
          if (e.button !== 0) return;
          a.dragging = true;
          a.path = [];
          if (reserved.get(a.seat) === id) reserved.delete(a.seat);
          container.zIndex = 1e9;
          container.cursor = "grabbing";
        });
        const release = () => {
          a.dragging = false;
          a.goal = { x: -1, y: -1 };
          container.cursor = "grab";
        };
        container.on("pointerup", release);
        container.on("pointerupoutside", release);
        return a;
      });
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.on("globalpointermove", (e) => {
        for (const a of agents)
          if (a.dragging)
            a.container.position.set(
              Math.max(22, Math.min(layout.width - 22, e.global.x)),
              Math.max(160, Math.min(layout.height - 30, e.global.y - scene.y)),
            );
      });
      const resize = () => {
        const scale = element.clientWidth / layout.width;
        element.style.height = `${layout.height * scale}px`;
        scene.y = -scroll.scrollTop / scale;
      };
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      scroll.addEventListener("scroll", resize);
      resize();
      let sampledState: ProjectState | null = null,
        sampledAt = -1,
        aggregates = new Map<string, ReturnType<typeof aggregateFamily>>();
      let frames = 0,
        totalCost = 0,
        maxCost = 0;
      // 30 fps is indistinguishable at these walking speeds and halves GPU/CPU wake-ups.
      app.ticker.maxFPS = settings.reducedMotion ? 10 : 30;
      app.ticker.add((ticker) => {
        const started = performance.now(),
          dt = Math.min(50, ticker.deltaMS) / 1000;
        clock.current += dt;
        const seconds = clock.current;
        if (latest.current !== sampledState || seconds - sampledAt > 1) {
          sampledState = latest.current;
          sampledAt = seconds;
          aggregates = new Map(
            ids.map((id) => [id, aggregateFamily(id, sampledState!)]),
          );
        }
        for (const object of objects)
          object.node.visible =
            object.y > -scene.y - 160 && object.y < -scene.y + 900;
        for (const a of agents) {
          if (a.dragging) continue;
          const aggregate = aggregates.get(a.id)!;
          const assigned = [
              ...new Set(
                aggregate.assigned.map(
                  (task) => topTask(task, latest.current.tasks).id,
                ),
              ),
            ].filter((id) => tables.has(id)),
            work = aggregate.tables.filter((id) => tables.has(id));
          let pose: Pose = "idle",
            target: Point = a.container,
            surface = "";
          if (aggregate.status === "running" && work.length) {
            if (reserved.get(a.seat) === a.id) reserved.delete(a.seat);
            const table = tables.get(
                work[Math.floor(seconds / 12) % work.length],
              )!,
              angle = seconds * 0.8 + a.i;
            target = {
              x: table.x + Math.cos(angle) * 127,
              y: table.y + Math.sin(angle) * 76,
            };
            pose = "run";
          } else if (assigned.length) {
            if (reserved.get(a.seat) === a.id) reserved.delete(a.seat);
            const table = tables.get(
              assigned[Math.floor(seconds / 24) % assigned.length],
            )!;
            const occupants = ids.filter((id) =>
                aggregates
                  .get(id)!
                  .assigned.some(
                    (task) =>
                      topTask(task, latest.current.tasks).id === table.id,
                  ),
              ),
              slot = occupants.indexOf(a.id),
              columns = Math.min(3, occupants.length);
            if (aggregate.status === "idle" && Math.floor(seconds / 14) % 2) {
              const angle = seconds * 0.25 + a.i;
              target = {
                x: table.x + Math.cos(angle) * 127,
                y: table.y + Math.sin(angle) * 76,
              };
              pose = "walk";
            } else {
              surface = table.id;
              target = {
                x: table.x + ((slot % columns) - (columns - 1) / 2) * 63,
                y: table.y - 7 + Math.floor(slot / columns) * 22,
              };
              pose = aggregate.status === "idle" ? "sleep" : "idle";
            }
          } else {
            a.seat = reserveSeat(a.id, a.container, layout.seats, reserved);
            if (a.seat >= 0) {
              target = layout.seats[a.seat];
              const phase =
                Math.floor(seconds / 9 + Math.floor(a.seat / 2)) % 4;
              const opposite = agents.find(
                (other) =>
                  other.id === reserved.get(a.seat ^ 1) &&
                  !other.dragging &&
                  Math.hypot(
                    other.container.x - layout.seats[a.seat ^ 1].x,
                    other.container.y - layout.seats[a.seat ^ 1].y,
                  ) < 5,
              );
              pose = ["unknown", "running", "waiting", "error"].includes(
                aggregate.status,
              )
                ? "idle"
                : enhanced && phase === 1 && opposite
                  ? "talk"
                  : enhanced && phase > 1
                    ? "hobby"
                    : "sit";
              if (
                seconds - a.lastSwitch > 35 &&
                !settings.reducedMotion &&
                !["unknown", "waiting", "error", "running"].includes(
                  aggregate.status,
                )
              ) {
                const free = layout.seats.findIndex(
                  (_, index) => !reserved.has(index),
                );
                if (free >= 0) {
                  reserved.delete(a.seat);
                  a.seat = free;
                  reserved.set(free, a.id);
                  target = layout.seats[free];
                }
                a.lastSwitch = seconds;
              }
            }
          }
          const pathIgnore =
            surface ||
            (!assigned.length && a.seat >= 0 ? `bench-${a.seat}` : "");
          const distance = Math.hypot(
            target.x - a.container.x,
            target.y - a.container.y,
          );
          if (settings.reducedMotion)
            a.container.position.set(target.x, target.y);
          else if (distance > 2) {
            if (pose !== "run") pose = "walk";
            if (
              pathIgnore !== a.ignore ||
              Math.hypot(target.x - a.goal.x, target.y - a.goal.y) > 16 ||
              seconds > a.nextPath ||
              !a.path.length
            ) {
              a.path = route(a.container, target, obstacles, pathIgnore);
              a.goal = { x: target.x, y: target.y };
              a.ignore = pathIgnore;
              a.nextPath = seconds + 1;
            }
            const point = a.path[0];
            if (point) {
              const dx = point.x - a.container.x,
                dy = point.y - a.container.y,
                length = Math.hypot(dx, dy),
                step = Math.min(length, (pose === "run" ? 145 : 70) * dt);
              if (length) {
                a.container.x += (dx / length) * step;
                a.container.y += (dy / length) * step;
              }
              if (length < 3) a.path.shift();
              if (a.art && Math.abs(dx) > 0.5)
                a.art.scale.x = Math.abs(a.art.scale.x) * (dx < 0 ? -1 : 1);
            }
          }
          const onSurface = surface && tables.get(surface)!;
          a.container.zIndex =
            onSurface && distance < 10
              ? onSurface.y + onSurface.ry + 3 + a.i * 0.01
              : a.container.y;
          a.container.visible =
            a.container.y > -scene.y - 120 && a.container.y < -scene.y + 850;
          if (a.art)
            a.art.texture =
              atlases[a.id][
                frameAt(
                  CHARACTERS[a.id as Family],
                  pose,
                  seconds,
                  settings.reducedMotion,
                )
              ];
          else if (a.container.visible) {
            const color = Number.parseInt(COLORS[a.i % COLORS.length].slice(1), 16);
            a.body
              .clear()
              .ellipse(0, 2, 16, 4)
              .fill({ color: 0x445449, alpha: 0.09 });
            for (const line of figureSegments(pose, seconds, settings.reducedMotion)) {
              a.body.moveTo(line[0][0], line[0][1]);
              for (const [x, y] of line.slice(1)) a.body.lineTo(x, y);
            }
            a.body.stroke({ color, width: 2.4, cap: "round", join: "round" });
            a.head.rotation = figureHeadRotation(pose);
          }
          a.bubble.text =
            [
              aggregate.counts.waiting ? `!${aggregate.counts.waiting}` : "",
              aggregate.counts.error ? `×${aggregate.counts.error}` : "",
              aggregate.counts.unknown || aggregate.status === "unknown"
                ? `?${aggregate.counts.unknown || ""}`
                : "",
            ]
              .filter(Boolean)
              .join(" ") ||
            (pose === "sleep" ? "zᶻ" : pose === "talk" ? "···" : "");
          a.lastPose = pose;
          memories.current.set(a.id, {
            x: a.container.x,
            y: a.container.y,
            seat: a.seat,
            lastSwitch: a.lastSwitch,
          });
        }
        const cost = performance.now() - started;
        frames++;
        totalCost += cost;
        maxCost = Math.max(maxCost, cost);
        if (frames % 15 === 0)
          element.dataset.officeActors = JSON.stringify(
            agents.map((a) => ({
              id: a.id,
              x: a.container.x,
              y: a.container.y,
              pose: a.lastPose,
              seat: a.seat,
              dragging: a.dragging,
            })),
          );
        element.dataset.officeMetrics = JSON.stringify({
          enhanced,
          frames,
          averageMs: totalCost / frames,
          maxMs: maxCost,
          actors: agents.length,
          tables: tables.size,
          seats: reserved.size,
        });
      });
      const visibility = () =>
        document.hidden || !activeTab.current
          ? app.ticker.stop()
          : app.ticker.start();
      pause.current = visibility;
      document.addEventListener("visibilitychange", visibility);
      visibility();
      cleanup = () => {
        observer.disconnect();
        scroll.removeEventListener("scroll", resize);
        document.removeEventListener("visibilitychange", visibility);
        Object.values(atlases)
          .flat()
          .forEach((texture) => texture.destroy(false));
      };
    };
    void setup().catch((error) => {
      if (!disposed) setFailed(`${t("renderFailed")} ${String(error)}`);
    });
    return () => {
      disposed = true;
      pause.current = () => {};
      cleanup();
      if (ready) app.destroy(true, { children: true });
    };
  }, [settings.enhanced, settings.reducedMotion, signature, t]);
  return (
    <>
      <div className="office-toolbar">
        <p>{t("officeHint")}</p>
        <div className="button-row">
          <button
            className="button small"
            aria-label={t("zoomOut")}
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="button small"
            aria-label={t("zoomIn")}
            onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
          >
            +
          </button>
        </div>
      </div>
      {failed ? (
        <div role="alert" className="notice">
          {failed}
        </div>
      ) : (
        <div
          ref={viewport}
          className={`office-viewport ${settings.enhanced ? "enhanced-world" : ""}`}
        >
          <div
            ref={host}
            className="office-canvas"
            style={{ width: `${zoom * 100}%`, minWidth: 700 * zoom }}
          />
        </div>
      )}
      <div className="agent-strip">
        {actors.map((id) => {
          const a = aggregateFamily(id, state);
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className="agent-chip"
            >
              <Avatar family={id} />
              <span>{familyName(id)}</span>
              {a.sessions.length ? (
                <Badge status={a.status} t={t} />
              ) : (
                <small>{t("noTrackedRun")}</small>
              )}
              {a.counts.running > 0 && <small>{a.counts.running}</small>}
            </button>
          );
        })}
      </div>
    </>
  );
}
