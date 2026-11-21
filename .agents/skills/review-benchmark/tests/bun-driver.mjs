// Calls one export of a script of the skill on Bun, for a test that vitest runs on Node (see helpers.mjs onBun):
//
//   bun bun-driver.mjs <script file> <export> <JSON list of arguments>
//
// The console.log lines of the call go to stdout as they are. The result of the call goes to stdout as one line
// `bun-driver result: <JSON>`, and the message of an error of the call goes to stderr as one line
// `bun-driver error: <JSON string>`, with the exit status 1.
const [script, name, args] = process.argv.slice(2);

try {
  const module = await import(script);
  if (typeof module[name] !== 'function') throw new Error(`${script} has no export ${name}`);
  const result = await module[name](...JSON.parse(args));
  if (result !== undefined) console.log(`bun-driver result: ${JSON.stringify(result)}`);
} catch (error) {
  console.error(`bun-driver error: ${JSON.stringify(error.message)}`);
  process.exitCode = 1;
}
