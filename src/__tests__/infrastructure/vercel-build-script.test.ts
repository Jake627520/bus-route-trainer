import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptPath = path.join(process.cwd(), 'scripts/vercel-build.sh');
const packageJsonPath = path.join(process.cwd(), 'package.json');

const stub = `#!/bin/sh
printf '%s %s db=%s direct=%s\\n' "$(basename "$0")" "$*" "\${DATABASE_URL-}" "\${DIRECT_URL-}" >> "$COMMAND_LOG"
if [ "\${FAIL_GENERATE:-}" = "1" ] && [ "$1" = "generate" ]; then
  exit 1
fi
if [ "\${FAIL_MIGRATE:-}" = "1" ] && [ "$1" = "migrate" ]; then
  exit 1
fi
`;

function recorded(bin: string, args: string, db = '', direct = '') {
  return `${bin} ${args} db=${db} direct=${direct}`;
}

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
  delete env.PREVIEW_DIRECT_URL;
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  if (vercelEnv !== undefined) env.VERCEL_ENV = vercelEnv;
  for (const [key, value] of Object.entries(extra)) env[key] = value;

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
    'skips migrate deploy when VERCEL_ENV is %j and no preview database is configured',
    (vercelEnv) => {
      const { commands, error } = runVercelBuild(vercelEnv, {
        DATABASE_URL: 'postgresql://prod-pool',
        DIRECT_URL: 'postgresql://prod-direct',
      });
      expect(error).toBeUndefined();
      expect(commands).toEqual([
        recorded('prisma', 'generate', 'postgresql://prod-pool', 'postgresql://prod-direct'),
        recorded('next', 'build', 'postgresql://prod-pool', 'postgresql://prod-direct'),
      ]);
    },
  );

  it('runs migrate deploy on production without using PREVIEW_DIRECT_URL', () => {
    const { commands, error } = runVercelBuild('production', {
      DATABASE_URL: 'postgresql://prod-pool',
      DIRECT_URL: 'postgresql://prod-direct',
      PREVIEW_DIRECT_URL: 'postgresql://preview-direct',
    });
    expect(error).toBeUndefined();
    expect(commands).toEqual([
      recorded('prisma', 'generate', 'postgresql://prod-pool', 'postgresql://prod-direct'),
      recorded('prisma', 'migrate deploy', 'postgresql://prod-pool', 'postgresql://prod-direct'),
      recorded('next', 'build', 'postgresql://prod-pool', 'postgresql://prod-direct'),
    ]);
  });

  it('migrates a preview database only through PREVIEW_DIRECT_URL', () => {
    const { commands, error } = runVercelBuild('preview', {
      DATABASE_URL: 'postgresql://prod-pool',
      DIRECT_URL: 'postgresql://prod-direct',
      PREVIEW_DIRECT_URL: 'postgresql://preview-direct',
    });
    expect(error).toBeUndefined();
    expect(commands).toEqual([
      recorded('prisma', 'generate', 'postgresql://prod-pool', 'postgresql://prod-direct'),
      recorded('prisma', 'migrate deploy', 'postgresql://preview-direct', 'postgresql://preview-direct'),
      recorded('next', 'build', 'postgresql://prod-pool', 'postgresql://prod-direct'),
    ]);
  });

  it('stops the production build when migrate deploy fails', () => {
    const { commands, error } = runVercelBuild('production', { FAIL_MIGRATE: '1' });
    expect(error).toBeDefined();
    expect(commands).toEqual([recorded('prisma', 'generate'), recorded('prisma', 'migrate deploy')]);
  });

  it('stops the preview build when the preview migrate fails', () => {
    const { commands, error } = runVercelBuild('preview', {
      PREVIEW_DIRECT_URL: 'postgresql://preview-direct',
      FAIL_MIGRATE: '1',
    });
    expect(error).toBeDefined();
    expect(commands).toEqual([
      recorded('prisma', 'generate'),
      recorded('prisma', 'migrate deploy', 'postgresql://preview-direct', 'postgresql://preview-direct'),
    ]);
  });

  it('stops before migrate or next build when prisma generate fails', () => {
    const { commands, error } = runVercelBuild('production', { FAIL_GENERATE: '1' });
    expect(error).toBeDefined();
    expect(commands).toEqual([recorded('prisma', 'generate')]);
  });
});
