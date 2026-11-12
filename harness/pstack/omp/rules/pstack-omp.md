---
description: Maps the Cursor names in pstack skills (Task, AskQuestion, subagent fields, model slugs, paths) to omp. Read once per session before you follow any pstack skill or act as a pstack agent.
---

# pstack in omp

pstack skills use Cursor names. In omp, read this rule once per session, then map each Cursor name in a skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/`: run `realpath skill://poteto-mode` in `bash` and go up two folders. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects.

## Tools

| Cursor | omp |
| --- | --- |
| `Task` | `task`. Put shared background in `context` and one item per subagent in `tasks[]`, each with `task`, `solutionSpace`, and `agent` when the row below names one. Several `Task` calls a step makes in parallel go in one `task` call. |
| `AskQuestion` | `ask`. In `-p` print mode there is no one to answer, so state the choice you made and go on. |
| Open a todolist | `todo` with `op: "init"`, one item per step, copied in verbatim. Mark items `done` as you go. |
| Run another pstack skill (`/name` or "the **name** skill") | `read` `skill://<name>` and follow it. Skills it links resolve inside `<pstack>`. When you tell the user to type it, write `/skill:<name>`. |
| `Grep`, `Glob`, `Read`, `Write`, `StrReplace`, `Shell` | `grep`, `glob`, `read`, `write`, `edit`, `bash`. |

## Subagent fields

| Cursor | omp |
| --- | --- |
| `subagent_type: generalPurpose` | Omit `agent`. The item runs on the default `task` agent. |
| `poteto-agent`, `comment-sicko` | `agent: "poteto-agent"`, `agent: "comment-sicko"`. omp does not prefix plugin agents. Give `poteto-agent` the path `skill://poteto-mode` in its brief. |
| `readonly: true` | Default `task` agent, and the brief says "read-only: do not edit files". Check `git status` afterward. Use `agent: "scout"` only for pure lookup with no judgment. |
| `readonly: false` | Default `task` agent. It keeps the session's MCP servers. |
| `environment: "cloud"` | `isolated: true` when the `task` schema offers it. Otherwise tell the worker to work in its own `git worktree` and name the branch or commit it checks out. |
| `environment: "local"` | Omit. |
| `cloud_base_branch: <b>` | Tell the worker to check out `<b>` first. |
| `run_in_background: true` | Omit. Spawns run in the background and their results arrive on their own. Call `wait` only when you have nothing else to do. |
| `resume` | `write` the follow-up to `agent://<id>`. That revives an idle or parked agent with its state. |
| `file_attachments` | List the paths in `context` or the item's `task`. |

## Models

omp passes a model per spawn only through the `task` item's `model` field, which takes one exact `provider/model-id:level` selector. It works only when `task.perCallModel` is `on` and the model is approved. When it is on, the `task` tool description lists the approved models.

| Cursor | omp |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | `model: "anthropic/claude-<family>-<version>:<effort>"`, such as `anthropic/claude-opus-5-5:xhigh`. Drop `-fast`. |
| A `grok-*`, `gpt-*`, or other non-Claude slug | The approved selector of the same family at that effort, such as `openai/gpt-5.5:high`. If none is approved, omit `model` and say so. |
| `auto` or `inherit-parent` | Omit `model`. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | `~/.omp/agent/rules/pstack-models.md`. It is an always-apply rule, so its role lines are already in context. If they are not, read the file. If the file or the role's line is missing, use the skill's default slug mapped with the rows above. |
| A role value `<provider>/<model-id>:<effort>` | Pass it as `model` unchanged. |

If a spawn fails preflight because per-call `model` is off or the model is not approved, spawn it again without `model` and say once that the role ran on the default model. Do not change settings to get past it.

## setup-pstack

Follow its steps with these changes:

- Detect. Run `omp models --json`. The detected models are each entry's `selector`, with an effort from its `thinking` list. Write a real model as `<selector>:<effort>`, such as `anthropic/claude-opus-5-5:xhigh`. The effort is the text after the last `:`, so the budget step edits that.
- Defaults. Map each default slug with the rows above: `claude-opus-5-5-xhigh` is `anthropic/claude-opus-5-5:xhigh`. `grok-4.7-xhigh-fast` is the detected `grok-4.7` selector at `xhigh`, else `inherit-parent`.
- Write. Write `~/.omp/agent/rules/pstack-models.md` with this frontmatter, then the comment lines, the `# budget` line, and one line per role from step 5. Overwrite the whole file. Never put the role lines in `AGENTS.md`.

  ```
  ---
  description: pstack per-role model choices (overrides skill defaults)
  alwaysApply: true
  ---
  ```

- Approve. Per-call models need two global settings. Show the user both commands and run them only after the user says yes. Read the current roles with `omp config get modelRoles --json`. Add a role `pstack-1`, `pstack-2`, and so on for each real selector in the rule that no role already has as its value. Write the merged record back with `omp config set modelRoles '<json>'`, then run `omp config set task.perCallModel on`. If the user says no, tell them every role runs on the session model until they do.

## Paths

| Cursor | omp |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.omp/skills/`, `~/.omp/agent/skills/` |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `<pstack>`, `<pstack>/.claude-plugin/plugin.json`. Find an installed skill with `skill://<name>`, never by searching `~/.omp/plugins/`. |
| `.cursor/rules/*.mdc`, always-applied rules | `.omp/rules/*.md` with `alwaysApply: true`, or `.omp/RULES.md` for short hard rules. Task subagents get rules and `RULES.md` but not `AGENTS.md`. omp never reads `.mdc` rules from `~/.cursor`. The model rule is the exception. See Models. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when that file exists. The plugin ships the skills, the agents, `docs/guide/`, and `README.md`. Read the local copy and never fetch it. Give the user the URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.omp/agent/sessions/<slug>/*.jsonl`. The slug is the workspace path relative to your home folder with each `/` changed to `-` and a leading `-`, so `/home/you/proj` is `-proj`. The newest `.jsonl` in that folder is the current session. A subagent's transcript is `history://<id>`. Read only this workspace's folder. |

## Cursor-only features

omp has no Cursor Automations, Bugbot, Cursor cloud agents, or built-in PR tool. When a step needs one, put one line in your reply, `Skipped in omp: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line.

| Cursor | omp |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command that the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps to an isolated worker, as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard status or its own machine. |
| A built-in PR tool | Use the forge command that the step gives, such as `gh pr create`. That is not a skip, so write no line. |
