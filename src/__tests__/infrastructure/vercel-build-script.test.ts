import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptPath = path.join(process.cwd(), 'scripts/vercel-build.sh');
const packageJsonPath = path.join(process.cwd(), 'package.json');

const stub = `#!/bin/sh
printf '%s %s\\n' "$(basename "$0")" "$*" >> "$COMMAND_LOG"
if [ "\${FAIL_GENERATE:-}" = "1" ] && [ "$1" = "generate" ]; then
  exit 1
fi
if [ "\${FAIL_MIGRATE:-}" = "1" ] && [ "$1" = "migrate" ]; then
  exit 1
fi
`;

function runVercelBuild(vercelEnv: string | undefined, extra: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vercel-build-'));
  const bin = path.join(dir, 'bin');
  const log = path.join(dir, 'commands.log');
  mkdirSync(bin);
  for (const name of ['prisma', 'next']) {
    const file = path.join(bin, name);
    writeFileSync(file, stub);
    chmodSync(file, 0o755);
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extra,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    COMMAND_LOG: log,
  };
  delete env.VERCEL_ENV;
  if (vercelEnv !== undefined) env.VERCEL_ENV = vercelEnv;

  let error: unknown;
  try {
    execFileSync('sh', [scriptPath], { env, cwd: dir, stdio: 'pipe' });
  } catch (caught) {
    error = caught;
  }
  let commands: string[] = [];
  try {
    commands = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    commands = [];
  }
  return { commands, error };
}

describe('vercel-build', () => {
  it('keeps local and CI builds on next build', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.build).toBe('next build');
    expect(pkg.scripts['vercel-build']).toBe('sh scripts/vercel-build.sh');
  });

  it.each([undefined, '', 'preview', 'development', 'Production'])(
    'skips migrate deploy when VERCEL_ENV is %j',
    (vercelEnv) => {
      const { commands, error } = runVercelBuild(vercelEnv);
      expect(error).toBeUndefined();
      expect(commands).toEqual(['prisma generate', 'next build']);
    },
  );

  it('runs migrate deploy only when VERCEL_ENV is production', () => {
    const { commands, error } = runVercelBuild('production');
    expect(error).toBeUndefined();
    expect(commands).toEqual(['prisma generate', 'prisma migrate deploy', 'next build']);
  });

  it('stops the production build when migrate deploy fails', () => {
    const { commands, error } = runVercelBuild('production', { FAIL_MIGRATE: '1' });
    expect(error).toBeDefined();
    expect(commands).toEqual(['prisma generate', 'prisma migrate deploy']);
  });

  it('stops before migrate or next build when prisma generate fails', () => {
    const { commands, error } = runVercelBuild('production', { FAIL_GENERATE: '1' });
    expect(error).toBeDefined();
    expect(commands).toEqual(['prisma generate']);
  });
});
