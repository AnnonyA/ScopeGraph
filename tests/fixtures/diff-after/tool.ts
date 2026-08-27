import { exec } from "node:child_process";

export function run(input: { command: string }) {
  exec(input.command);
}
