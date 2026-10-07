import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  FAMILIES,
  fail,
  taskValuesSchema,
  noteValuesSchema,
  validateGraph,
  type Task,
  type Note,
} from "../shared/domain";
import { hash } from "./files";

const record = z.object({ id: z.string().min(1) }).passthrough();
const snapshotSchema = z
  .object({
    schemaVersion: z.number().int().min(1).max(4),
    projects: z.array(record.extend({ name: z.string().min(1) })).max(1000),
    tasks: z
      .array(record.extend({ projectId: z.string(), title: z.string().min(1) }))
      .max(10000),
    notes: z.array(record).max(10000).optional(),
    meetingNotes: z.array(record).max(10000).optional(),
  })
  .passthrough();
export function readLegacy(file: string) {
  if (fs.statSync(file).size > 20 * 1024 * 1024) fail("LEGACY_FILE_TOO_LARGE");
  const raw = fs.readFileSync(file, "utf8");
  let data: any;
  if (raw.trimStart().startsWith("{")) data = JSON.parse(raw);
  else {
    // Only read an inert data block; never load HTML, eval scripts or follow links.
    const blocks = [
      ...raw.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi),
    ];
    const find = (id: string) =>
      blocks
        .find((b) =>
          new RegExp(`\\bid\\s*=\\s*["']${id}["']`, "i").test(b[1]),
        )?.[2]
        .trim();
    const readable = find("workPlannerData"),
      encoded = find("workPlannerEmbeddedSnapshot");
    if (readable) data = JSON.parse(readable);
    else if (encoded)
      data = JSON.parse(
        Buffer.from(encoded, "base64").toString("utf8"),
      ).snapshot;
    else fail("LEGACY_DATA_NOT_FOUND");
  }
  const snapshot = snapshotSchema.parse(data);
  if (!snapshot.notes && !snapshot.meetingNotes) fail("INVALID_LEGACY_NOTES");
  for (const collection of [
    snapshot.projects,
    snapshot.tasks,
    snapshot.notes ?? snapshot.meetingNotes ?? [],
  ])
    if (new Set(collection.map((r) => r.id)).size !== collection.length)
      fail("LEGACY_DUPLICATE_ID");
  return { snapshot, hash: hash(raw), file: path.basename(file) };
}
export function legacyPreview(file: string) {
  const source = readLegacy(file);
  return {
    hash: source.hash,
    file: source.file,
    crossProjectDependencies: source.snapshot.tasks.flatMap(task => (Array.isArray(task.prerequisiteTaskIds) ? task.prerequisiteTaskIds : []).flatMap(id => {
      const dependency = source.snapshot.tasks.find(t => t.id === id);
      return dependency && dependency.projectId !== task.projectId ? [{ taskId: task.id, from: task.projectId, to: dependency.projectId, dependencyId: id }] : [];
    })),
    projects: source.snapshot.projects.map((p) => ({
      id: p.id,
      title: p.name,
      tasks: source.snapshot.tasks.filter((t) => t.projectId === p.id).length,
      notes: (
        source.snapshot.notes ??
        source.snapshot.meetingNotes ??
        []
      ).filter((n) => n.projectId === p.id).length,
    })),
  };
}
export function convertLegacy(
  file: string,
  projectId: string | string[],
  expectedHash: string,
) {
  const source = readLegacy(file);
  if (source.hash !== expectedHash) fail("LEGACY_FILE_CHANGED");
  const selected = new Set(Array.isArray(projectId) ? projectId : [projectId]);
  const projects = source.snapshot.projects.filter(p => selected.has(p.id));
  if (!projects.length || projects.length !== selected.size) fail("LEGACY_PROJECT_NOT_FOUND");
  const project = { name: projects.map(p => p.name).join(" + "), highLevelInfo: projects.map(p => `${p.name}\n${p.highLevelInfo ?? ""}`).join("\n\n") };
  const rawTasks = source.snapshot.tasks.filter(
      (t) => selected.has(t.projectId),
    ),
    rawNotes = (
      source.snapshot.notes ??
      source.snapshot.meetingNotes ??
      []
    ).filter((n) => selected.has(String(n.projectId)));
  const ids = new Map(rawTasks.map((t) => [t.id, randomUUID()])),
    at = new Date().toISOString();
  const text = (value: unknown) =>
    value == null
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2);
  const tasks: Task[] = rawTasks.map((old) => {
    const owner = text(old.owner),
      family = FAMILIES.find((f) => owner.toLowerCase().includes(f)),
      dependencies = (
        Array.isArray(old.prerequisiteTaskIds) ? old.prerequisiteTaskIds : []
      ).map(String);
    if (dependencies.some((id) => !ids.has(id)))
      fail("LEGACY_CROSS_PROJECT_DEPENDENCY", old.title);
    const artifacts = (
      Array.isArray(old.outputDirectories) ? old.outputDirectories : []
    )
      .map((output: any) => {
        const value =
          typeof output === "string"
            ? output
            : String(output.path ?? output.directory ?? "");
        return {
          id: randomUUID(),
          label:
            typeof output === "object"
              ? String(output.label ?? output.name ?? value)
              : value,
          path: value,
        };
      })
      .filter((a) => a.path);
    const values = taskValuesSchema.parse({
      title: old.title,
      description: [
        text(old.description),
        `Legacy project: ${source.snapshot.projects.find(p => p.id === old.projectId)?.name ?? old.projectId}`,
        `Legacy task ID: ${old.id}`,
        owner && `Legacy owner: ${owner}`,
        old.progress && `Progress notes:\n${text(old.progress)}`,
        old.prerequisiteNote &&
          `Prerequisite notes:\n${text(old.prerequisiteNote)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      dependencies: dependencies.map((id) => ids.get(id)),
      assignees: family ? [family] : old.ownerType === "human" ? ["human"] : [],
      status:
        old.status === "Done"
          ? "delivered"
          : old.status === "In progress"
            ? "doing"
            : "todo",
      endDate: text(old.deadline).slice(0, 10),
      artifacts,
      progress: old.status === "Done" ? 100 : 0,
    });
    return {
      ...values,
      id: ids.get(old.id)!,
      revision: 1,
      archived: false,
      acceptedAt: null,
      createdAt: at,
      updatedAt: at,
    };
  });
  validateGraph(tasks);
  const notes: Note[] = rawNotes.map((old) => ({
    ...noteValuesSchema.parse({
      title: text(old.title) || "Imported note",
      kind: old.kind === "chat-summary" ? "note" : "meeting",
      body: [
        "scheduledAt",
        "attendees",
        "summary",
        "decisions",
        "actionItems",
        "notes",
        "openQuestions",
        "sourceReference",
        "sourceConversationId",
      ]
        .filter((k) => old[k])
        .map((k) => `${k}\n${text(old[k])}`)
        .join("\n\n"),
    }),
    id: randomUUID(),
    revision: 1,
    createdAt: at,
    updatedAt: at,
  }));
  return {
    title: project.name,
    description: text(project.highLevelInfo),
    tasks,
    notes,
    provenance: {
      file: source.file,
      hash: source.hash,
      schemaVersion: source.snapshot.schemaVersion,
      project,
      projects,
      idMapping: Object.fromEntries(ids),
      rawTasks,
      rawNotes,
      notice:
        "Legacy Done tasks require new human acceptance. Old proposals and executable HTML are not applied.",
    },
  };
}
