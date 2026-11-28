#!/usr/bin/env node
/**
 * A stand-in for the Claude Code program, for tests: it writes down how it
 * was started (arguments, folder, environment, what was typed to it) and
 * prints the kind of event stream the real one prints.
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

if (args[0] === "--version") {
  console.log("9.9.9 (Claude Code)");
  process.exit(0);
}
if (args[0] === "auth") {
  const signedIn = !process.env.CLAUDE_CONFIG_DIR?.includes("signed-out");
  console.log(
    JSON.stringify({
      loggedIn: signedIn,
      // Signed in to a plan, unless its folder says it is the Console's.
      authMethod: process.env.CLAUDE_CONFIG_DIR?.includes("console") ? "console" : "claude.ai",
      email: "someone@example.com",
      subscriptionType: "max",
    }),
  );
  process.exit(0);
}

let typed = "";
for await (const chunk of process.stdin) typed += chunk;
const log = process.env.FAKE_CLAUDE_LOG;
if (log) {
  const runs = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, "utf8")) : [];
  runs.push({ args, cwd: process.cwd(), typed, env: { ...process.env } });
  fs.writeFileSync(log, JSON.stringify(runs));
}

const resume = args[args.indexOf("--resume") + 1];
const session = args.includes("--resume") ? resume : `sess-${typed.length}`;
// Like the real one, it names the model it settled on: an alias as the full id it stands for.
const ALIASES = { fable: "claude-fable-5-1", opus: "claude-opus-5-5", sonnet: "claude-sonnet-5-5" };
const asked = args.includes("--model") ? args[args.indexOf("--model") + 1] : "opus";
const model = ALIASES[asked] ?? asked;
out({ type: "system", subtype: "init", session_id: session, cwd: process.cwd(), model });

const mode = process.env.FAKE_CLAUDE_MODE ?? "";
if (/\/hang/.test(typed)) await new Promise(() => setInterval(() => {}, 1000));
if (/\/signedout/.test(typed) || mode === "signedout") {
  out({
    type: "result",
    subtype: "success",
    is_error: true,
    result: "Invalid API key · Please run /login",
    session_id: session,
  });
  process.exit(1);
}
if (/\/crash/.test(typed)) {
  process.stderr.write("something broke badly\n");
  process.exit(3);
}

const delta = (d) =>
  out({
    type: "stream_event",
    session_id: session,
    parent_tool_use_id: null,
    event: { type: "content_block_delta", index: 0, delta: d },
  });
const start = () =>
  out({
    type: "stream_event",
    session_id: session,
    parent_tool_use_id: null,
    event: { type: "message_start" },
  });

if (mode === "whole") {
  // an older version: no pieces, only whole messages
  out({
    type: "assistant",
    session_id: session,
    parent_tool_use_id: null,
    message: { content: [{ type: "text", text: "Whole answer." }] },
  });
} else {
  start();
  delta({ type: "thinking_delta", thinking: "let me look" });
  delta({ type: "text_delta", text: "Looking" });
  delta({ type: "text_delta", text: " at it." });
  out({
    type: "assistant",
    session_id: session,
    parent_tool_use_id: null,
    message: {
      content: [
        { type: "text", text: "Looking at it." },
        { type: "tool_use", id: "t1", name: "Read", input: { file_path: "README.md" } },
        { type: "tool_use", id: "t2", name: "Bash", input: { command: "npm   test" } },
      ],
    },
  });
  out({
    type: "user",
    session_id: session,
    parent_tool_use_id: null,
    message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "# hi" }] },
  });
  // a helper's chatter, which is not part of the reply
  out({
    type: "stream_event",
    session_id: session,
    parent_tool_use_id: "t9",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "HELPER NOISE" },
    },
  });
  start();
  delta({ type: "text_delta", text: `Done (${args.includes("--resume") ? "resumed" : "new"}).` });
  out({
    type: "assistant",
    session_id: session,
    parent_tool_use_id: null,
    message: { content: [{ type: "text", text: "Done." }] },
  });
}
out({ type: "result", subtype: "success", is_error: false, result: "Done.", session_id: session });
