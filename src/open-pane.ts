import { Herdr } from "./io/herdr.ts";

// Actions can't open popups directly; they ask herdr to open one of the manifest's panes.
await new Herdr().openPane(process.argv[2] ?? "menu");
