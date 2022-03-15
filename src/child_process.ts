import * as cprocess from 'child_process';
import { promisify } from 'util';
const exec = promisify(cprocess.exec);

export const execChildCommand = async (
  command: string,
  cwd: string
): Promise<{ stdout: string; stderr: string }> => {
  const { stdout, stderr } = await exec(command, { cwd });
  console.log(stdout);
  console.error(stderr);
  return { stdout, stderr };
};
