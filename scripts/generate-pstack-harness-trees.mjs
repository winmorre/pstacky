#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PSTACK = join(ROOT, "pstack");
const SKILLS = join(PSTACK, "skills");
const AGENTS = join(PSTACK, "agents");
// Outside pstack/ so Cursor, which copies the whole plugin folder, does not install these trees too.
const OUT = "harness/pstack";
const GUIDE = "docs/guide";
const COMMAND = "node scripts/generate-pstack-harness-trees.mjs";
const GITHUB = "https://github.com/winmorre/pstacky";
const MARKETPLACE = { name: "pstacky", owner: { name: "winmorre" } };
const LINK = /\]\(([^)\s]+)\)/g;

// One installable tree per harness. `adapter` is the pstack file that maps Cursor names to the harness;
// `adapterOut` is where the tree ships it, and `line` is what wrapped files say about it.
const TREES = [
  {
    name: "claude-code",
    label: "Claude Code",
    adapter: "docs/harness/claude-code.md",
    adapterOut: "docs/harness/claude-code.md",
    line:
      "In Claude Code, read [the Claude Code adapter](../../docs/harness/claude-code.md) once per session before you follow this skill. " +
      "It maps the Cursor names in pstack skills to Claude Code.",
    wrapAgents: false,
    manifests: ["plugin.json", ".claude-plugin/plugin.json"],
    marketplace: ".claude-plugin/marketplace.json",
  },
  {
    // omp installs this tree from `.omp-plugin/marketplace.json`. It ships only the Claude-format manifest: a root
    // Agent Plugins `plugin.json` would route skills through strict validation, which rejects `disable-model-invocation`.
    // The adapter ships as a plugin rule so every skill and agent can read it as `rule://pstack-omp`.
    name: "omp",
    label: "omp",
    adapter: "docs/harness/omp.md",
    adapterOut: "rules/pstack-omp.md",
    line:
      "In omp, read `rule://pstack-omp` once per session before you follow these instructions. " +
      "It maps the Cursor names in pstack to omp.",
    wrapAgents: true,
    manifests: [".claude-plugin/plugin.json"],
    marketplace: ".omp-plugin/marketplace.json",
  },
];

const README = `# pstack harness trees

This folder is generated from \`pstack/skills\`, \`pstack/agents\`, \`pstack/${GUIDE}\`, \`pstack/docs/harness/\`, \`pstack/README.md\`, \`pstack/LICENSE\`, and \`pstack/plugin.json\`. Do not edit it by hand.

Cursor uses \`pstack/\` directly. Claude Code installs \`claude-code/\` through \`.claude-plugin/marketplace.json\`, and omp installs \`omp/\` through \`.omp-plugin/marketplace.json\`. The trees leave out the rest of \`pstack/\`, such as \`pstack/automations\` and \`pstack/assets\`. A relative link to a pstack file that a tree leaves out points at that file on GitHub \`main\` instead.

Both trees carry the version \`<pstack version>.u<content hash>\`, so any change to their content is a new version that \`claude plugin update\` and \`omp plugin upgrade\` pick up.

After editing those sources, run \`${COMMAND}\` from the repository root and commit the result.
`;

const TERMS = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "poteto-agent", re: /poteto-agent/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: "`environment: \"cloud\"`", re: /environment: "(cloud|local)"/ },
  { key: "cloud_base_branch", re: /cloud_base_branch/ },
  { key: "`run_in_background: true`", re: /run_in_background/ },
  { key: "`resume`", re: /`resume`/ },
  { key: "`file_attachments`", re: /file_attachments/ },
  { key: "claude-", re: /\bclaude-[a-z]+-\d/ },
  { key: "grok-", re: /\bgrok-\d/ },
  { key: "gpt-", re: /\bgpt-\d/ },
  { key: "inherit-parent", re: /inherit-parent/ },
  { key: "pstack-models.mdc", re: /pstack-models\.mdc/ },
  { key: ".cursor/skills/", re: /\.cursor\/skills/ },
  { key: "~/.cursor/plugins/", re: /\.cursor\/plugins|\.cursor-plugin/ },
  { key: ".cursor/rules/", re: /\.cursor\/rules|always-applied rule/ },
  { key: "agent-transcripts", re: /agent-transcripts|\.cursor\/projects/ },
  { key: "Cursor-only features", re: /Bugbot|Cursor [Aa]utomation|cursor\.(sh|com)\/automations|[Cc]loud [Aa]gent|built-in PR tool/ },
];
const ROUTE_KEY = "Run another pstack skill";
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function file(path) {
  return { bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}

function text(bytes, executable = false) {
  return { bytes: Buffer.from(bytes), executable };
}

const skills = readdirSync(SKILLS).filter((name) => existsSync(join(SKILLS, name, "SKILL.md")));
const others = (skill) => skills.filter((name) => name !== skill).join("|");

// The Cursor names that the markdown files under `paths` use, keyed like TERMS.
function cursorNames(paths, skill) {
  const route = new RegExp(`the \\*\\*(?<bold>${others(skill)})\\*\\* skill|\`/(?<command>${others(skill)})\``, "g");
  const linksToSkill = (line, name) => line.includes(`(../${name}/`);
  const namesBareSkill = (line) =>
    [...line.matchAll(route)].some(({ groups }) => !linksToSkill(line, groups.bold ?? groups.command));
  const names = new Set();
  for (const path of paths.filter((path) => path.endsWith(".md"))) {
    const body = readFileSync(path, "utf8");
    for (const term of TERMS) if (term.re.test(body)) names.add(term.key);
    if (body.split("\n").some(namesBareSkill)) names.add(ROUTE_KEY);
  }
  return names;
}

// Skills and agents that use Cursor names get the adapter line under their H1.
const wrapped = new Map();
for (const skill of skills) {
  const names = cursorNames(walk(join(SKILLS, skill)), skill);
  wrapped.set(`skills/${skill}/SKILL.md`, { names, kind: "skill", owner: skill });
}
for (const agent of readdirSync(AGENTS).filter((name) => name.endsWith(".md"))) {
  const names = cursorNames([join(AGENTS, agent)], agent.replace(/\.md$/, ""));
  wrapped.set(`agents/${agent}`, { names, kind: "agent", owner: agent });
}

const problems = [];
for (const [path, { names, kind }] of wrapped) {
  const body = readFileSync(join(PSTACK, path), "utf8");
  if (names.size > 0 && !/^# /m.test(body)) problems.push(`${path} uses Cursor names but has no H1`);
  if (kind !== "skill") continue;
  // Cursor runs a skill by its folder name and Claude Code and omp list it by its frontmatter `name`, so the two must match. The Agent Skills spec limits both to SKILL_NAME.
  const skill = path.split("/")[1];
  const frontmatter = body.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const name = frontmatter.match(/^name:(.*)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  if (name !== skill) problems.push(`${path} has name ${JSON.stringify(name ?? "")}, not its folder name ${skill}`);
  if (!SKILL_NAME.test(skill) || skill.length > 64) problems.push(`skills/${skill} is not lowercase words joined by hyphens, at most 64 characters`);
}
for (const tree of TREES) {
  const adapter = readFileSync(join(PSTACK, tree.adapter), "utf8");
  const users = new Map();
  for (const [path, { names, kind, owner }] of wrapped) {
    if (kind === "agent" && !tree.wrapAgents) continue;
    for (const key of names) users.set(key, [...(users.get(key) ?? []), owner]);
  }
  for (const [key, using] of users) {
    if (!adapter.includes(key)) problems.push(`${tree.label} adapter has no row for ${key}, used by ${using.join(", ")}`);
  }
}
for (const problem of problems) console.log(`FAIL ${problem}`);
if (problems.length > 0) process.exit(1);

// The pstack-relative path that a relative link in `from` points at, if that path exists.
function resolve(from, href) {
  const target = href.replace(/[#?].*/, "");
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  const path = posix.join(posix.dirname(from), target).replace(/\/$/, "");
  return existsSync(join(PSTACK, path)) ? path : undefined;
}

function has(files, path) {
  return files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`));
}

function render(tree) {
  // Skills read the adapter, the guide, and the README at runtime, so the harness never fetches them.
  const copies = [...walk(SKILLS), ...walk(AGENTS), ...walk(join(PSTACK, GUIDE)), join(PSTACK, "README.md")];
  const files = new Map(copies.map((path) => [relative(PSTACK, path), file(path)]));
  for (const [path, { names, kind }] of wrapped) {
    if (names.size === 0 || (kind === "agent" && !tree.wrapAgents)) continue;
    const body = files.get(path).bytes.toString("utf8");
    files.get(path).bytes = Buffer.from(body.replace(/^(# .*)\n+/m, `$1\n\n${tree.line}\n\n`));
  }
  files.set("LICENSE", file(join(PSTACK, "LICENSE")));
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    const body = entry.bytes.toString("utf8").replace(LINK, (link, href) => {
      const target = resolve(path, href);
      if (!target || target.split("/")[0] === ".." || has(files, target) || target === tree.adapter) return link;
      const kind = statSync(join(PSTACK, target)).isDirectory() ? "tree" : "blob";
      return `](${GITHUB}/${kind}/main/pstack/${target}${href.slice(href.search(/[#?]|$/))})`;
    });
    entry.bytes = Buffer.from(body);
  }
  // The adapter is added after the link rewrite, so it must not use relative links: omp ships it outside docs/.
  files.set(tree.adapterOut, file(join(PSTACK, tree.adapter)));
  return files;
}

// A harness installs only its tree, so a relative link that works from pstack/ has to work inside the tree too.
// Links to pstack files that a tree leaves out already point at GitHub, so a failure here is a link that leaves pstack/.
const trees = new Map(TREES.map((tree) => [tree, render(tree)]));
const dangling = [];
for (const [tree, files] of trees) {
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    for (const [, href] of entry.bytes.toString("utf8").matchAll(LINK)) {
      const target = resolve(path, href);
      const resolved = target === tree.adapter ? tree.adapterOut : target;
      if (target && !has(files, resolved)) dangling.push(`${OUT}/${tree.name}/${path} links to ${href}, which is not in the tree`);
    }
  }
}
for (const link of dangling) console.log(`FAIL ${link}`);
if (dangling.length > 0) process.exit(1);

// Claude Code and omp reinstall a plugin only when its version changes, so the version carries a hash of the content.
const hash = createHash("sha256");
for (const [tree, files] of trees) {
  for (const path of [...files.keys()].sort()) hash.update(`${tree.name}/${path}\0`).update(files.get(path).bytes).update("\0");
}
const manifest = JSON.parse(readFileSync(join(PSTACK, "plugin.json"), "utf8"));
const version = `${manifest.version}.u${hash.digest("hex").slice(0, 8)}`;
const plugin = { ...manifest, version, homepage: `${GITHUB}/tree/main/pstack`, repository: GITHUB };
const json = (value) => text(`${JSON.stringify(value, null, 2)}\n`);

const rendered = new Map([[`${OUT}/README.md`, text(README)]]);
for (const [tree, files] of trees) {
  for (const path of tree.manifests) files.set(path, json(plugin));
  for (const [path, entry] of files) rendered.set(`${OUT}/${tree.name}/${path}`, entry);
  rendered.set(
    tree.marketplace,
    json({
      $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
      ...MARKETPLACE,
      metadata: { description: `pstack for ${tree.label}, forked from cursor/plugins.` },
      plugins: [
        {
          name: plugin.name,
          source: `./${OUT}/${tree.name}`,
          version,
          description: plugin.description,
          author: plugin.author,
          homepage: plugin.homepage,
          license: plugin.license,
        },
      ],
    }),
  );
}

if (process.argv.includes("--check")) {
  const onDisk = new Map(
    [...(existsSync(join(ROOT, OUT)) ? walk(join(ROOT, OUT)) : []), ...TREES.map((tree) => join(ROOT, tree.marketplace)).filter(existsSync)].map(
      (path) => [relative(ROOT, path), file(path)],
    ),
  );
  const drifted = [...new Set([...rendered.keys(), ...onDisk.keys()])].sort().filter((path) => {
    const [want, have] = [rendered.get(path), onDisk.get(path)];
    return !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable;
  });
  for (const path of drifted.slice(0, 20)) console.log(path);
  if (drifted.length > 0) {
    console.log(`The harness trees are out of date. Run \`${COMMAND}\` and commit the result.`);
    process.exit(1);
  }
  console.log(`The harness trees are up to date (${version}).`);
} else {
  rmSync(join(ROOT, OUT), { recursive: true, force: true });
  for (const [path, { bytes, executable }] of rendered) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), bytes);
    chmodSync(join(ROOT, path), executable ? 0o755 : 0o644);
  }
  for (const [tree] of trees) {
    const count = [...wrapped].filter(([, { names, kind }]) => names.size > 0 && (kind === "skill" || tree.wrapAgents)).length;
    console.log(`${tree.label}: ${skills.length} skills, ${count} files with the adapter line`);
  }
  console.log(`version ${version}`);
}
