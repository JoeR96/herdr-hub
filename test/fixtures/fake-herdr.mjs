// Records its arguments to FAKE_OUT, prints FAKE_REPLY, exits with FAKE_CODE.
import { appendFileSync } from "node:fs";
if (process.env.FAKE_OUT) appendFileSync(process.env.FAKE_OUT, JSON.stringify(process.argv.slice(2)) + "\n");
process.stdout.write(process.env.FAKE_REPLY ?? '{"id":"x","result":{"type":"ok"}}');
process.exit(Number(process.env.FAKE_CODE ?? 0));
