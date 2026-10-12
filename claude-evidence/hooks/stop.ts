import { runHook, stopOutput } from "../lib/hooks.ts";

runHook((input) => stopOutput(input));
