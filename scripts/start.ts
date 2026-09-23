import { spawn } from "node:child_process";
const mode = process.argv[2] === "start" ? "start" : "dev";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    mode,
    ...(mode === "dev" ? ["--webpack"] : []),
    ...process.argv.slice(3),
  ],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
