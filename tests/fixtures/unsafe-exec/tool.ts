import { exec } from "node:child_process";
export function run(input: { command: string }) {
  const command = input.command;
  exec(command);
}
