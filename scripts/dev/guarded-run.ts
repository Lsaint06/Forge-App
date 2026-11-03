// Runs build steps one after another in this terminal (Phase 8.1), and puts
// files back as they were if a step changed them. Ctrl+C cancels: the
// terminal stops the running step, no later step starts, and the files are
// still put back once that step has exited.
// Asynchronous on purpose: tsx relays Ctrl+C to this process and kills it
// about 60 ms later unless the event loop answers, which a blocking spawnSync
// prevents. And Expo's CLI exits 0 when cancelled, so cancellation is
// recorded here rather than read from exit codes.

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

export type Step = {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

export type GuardedResult = {
  /** The last step's exit status (1 if it couldn't start or was killed). */
  status: number;
  /** Ctrl+C, or a termination signal, arrived while the steps ran. */
  cancelled: boolean;
  /** The files that were changed and have been put back. */
  restored: string[];
};

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

export async function runGuarded(
  steps: Step[],
  files: string[],
): Promise<GuardedResult> {
  const before = files.map((file) => ({ file, content: readFileSync(file) }));
  let cancelled = false;
  let running: ChildProcess | undefined;
  const cancel = (signal: NodeJS.Signals) => {
    cancelled = true;
    // Ctrl+C in the terminal reaches the step directly; a stop sent only to
    // this process (npm's or an editor's) is passed on to the step.
    running?.kill(signal);
  };
  for (const signal of SIGNALS) process.on(signal, cancel);
  try {
    let status = 0;
    for (const step of steps) {
      status = await new Promise<number>((resolve) => {
        const child = spawn(step.command, step.args, {
          stdio: "inherit",
          env: step.env,
        });
        running = child;
        child.once("error", () => resolve(1));
        child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
      });
      running = undefined;
      if (cancelled || status !== 0) break;
    }
    const restored: string[] = [];
    for (const { file, content } of before) {
      let now: Buffer | undefined;
      try {
        now = readFileSync(file);
      } catch {
        now = undefined;
      }
      if (!now?.equals(content)) {
        writeFileSync(file, content);
        restored.push(file);
      }
    }
    return { status, cancelled, restored };
  } finally {
    for (const signal of SIGNALS) process.off(signal, cancel);
  }
}
