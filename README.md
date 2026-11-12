# pstacky

Our fork of [pstack](https://github.com/cursor/plugins/tree/main/pstack) from `cursor/plugins`, packaged for Claude Code and omp. One repository, one install script, same skills on every laptop.

## Install on a laptop

Needs `git`, plus `claude` and/or `omp` on `PATH`. The script installs into whichever is present, at user scope.

```bash
git clone git@github.com:winmorre/pstacky.git ~/pstacky
bash ~/pstacky/install.sh
```

Run the script with `bash` or `./install.sh`. Don't `source` it: it refuses, because sourcing would leave `set -e` on in your shell and the next failing command would close the terminal.

`PSTACKY_SOURCE` sets where the tools fetch the marketplace from. It defaults to `winmorre/pstacky`, the GitHub shorthand. If the repository is private and your git credentials are SSH keys, use `PSTACKY_SOURCE=git@github.com:winmorre/pstacky.git bash ~/pstacky/install.sh`. Rerun the same command to update. The clone itself is only needed for the script, since each tool keeps its own copy of the marketplace.

By hand, the script does this:

| | Claude Code | omp |
| --- | --- | --- |
| add | `claude plugin marketplace add winmorre/pstacky` | `omp plugin marketplace add winmorre/pstacky` |
| install | `claude plugin install pstack@pstacky` | `omp plugin install pstack@pstacky` |
| update | `claude plugin marketplace update pstacky && claude plugin update pstack@pstacky` | `omp plugin marketplace update pstacky && omp plugin upgrade pstack@pstacky` |

Then start a new session and pick models once per laptop:

| | Claude Code | omp |
| --- | --- | --- |
| setup | `/pstack:setup-pstack` | `/skill:setup-pstack` |
| main entry | `/pstack:poteto-mode <task>` | `/skill:poteto-mode <task>` |
| model rule written to | `~/.claude/rules/pstack-models.md` | `~/.omp/agent/rules/pstack-models.md` |

The model rule is per laptop on purpose: which models you can use depends on each machine's logins. On omp, `setup-pstack` also offers to turn on `task.perCallModel` and add `pstack-N` entries to `modelRoles`, because omp only lets a subagent pick its own model when both are set. Without them, every pstack role runs on the session model.

## How it works

```
pstack/                          upstream pstack, plus our edits (Cursor reads this as-is)
pstack/docs/harness/claude-code.md   upstream's Cursor → Claude Code name map
pstack/docs/harness/omp.md       our Cursor → omp name map
scripts/generate-pstack-harness-trees.mjs
harness/pstack/claude-code/      generated; installed by Claude Code
harness/pstack/omp/              generated; installed by omp
.claude-plugin/marketplace.json  generated; Claude Code reads it
.omp-plugin/marketplace.json     generated; omp reads it ahead of .claude-plugin/
```

pstack skills are written with Cursor tool names (`Task`, `AskQuestion`, `subagent_type`, model slugs). Each generated tree prepends one line to every skill that uses them, pointing at the harness's name map:

- Claude Code: `docs/harness/claude-code.md` inside the plugin, maintained upstream.
- omp: the plugin rule `rule://pstack-omp`, built from `pstack/docs/harness/omp.md`. The omp tree also adds the line to the `poteto-agent` and `comment-sicko` agents, so delegates read it too.

The omp tree ships only `.claude-plugin/plugin.json`. A root `plugin.json` would make omp load the skills as strict Agent Plugins, which rejects the `disable-model-invocation` field on 57 of the 58 skills.

Both trees get the version `<pstack version>.u<content hash>`. Any content change is a new version, so `claude plugin update` and `omp plugin upgrade` pick it up without a manual version bump.

## Change pstack

1. Edit files under `pstack/`.
2. Run `node scripts/generate-pstack-harness-trees.mjs`. It fails if a skill uses a Cursor name that a harness map has no row for. Add the row to the map, then run it again.
3. Commit everything, including `harness/` and both marketplace files, and push.
4. Rerun `install.sh` on each laptop.

`node scripts/generate-pstack-harness-trees.mjs --check` exits non-zero when the generated files are stale.

## Pull upstream changes

```bash
scripts/sync-upstream.sh        # or: scripts/sync-upstream.sh <branch-or-tag>
git push origin main upstream
```

The `upstream` branch holds only files copied from `cursor/plugins` (`pstack/`, the generator, `UPSTREAM` with the source commit). The script commits a fresh copy there and merges it into your branch, so your edits survive and git flags only real conflicts. Expect a conflict in `scripts/generate-pstack-harness-trees.mjs` whenever upstream changes it, because ours builds two trees. When it stops on a conflict, resolve it, run the generator, and commit.
