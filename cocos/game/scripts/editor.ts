import { executable, project } from './paths';

const child = Bun.spawn([executable, '--project', project, ...process.argv.slice(2)], {
  stdout: 'inherit', stderr: 'inherit',
});
process.exit(await child.exited);
