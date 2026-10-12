import { runHook, sessionStartOutput } from "../lib/hooks.ts";

runHook((input) => (typeof input.cwd === "string" ? sessionStartOutput(input.cwd) : null));
