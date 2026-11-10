import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 稽核待辦 3：GitHub Actions 的第三方 action 必須釘 commit SHA（tag 可被改指向），
 * 並在行尾註明版本，格式：`uses: owner/repo@<40 位 sha> # vX.Y.Z`。
 * 本地 action（`./`）與 docker:// 不在此限。
 */
const WORKFLOW_DIR = path.join(process.cwd(), '.github/workflows');
const PINNED = /^uses:\s+[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s+v\d+\.\d+\.\d+\s*$/;

const usesLines = readdirSync(WORKFLOW_DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .flatMap((f) =>
    readFileSync(path.join(WORKFLOW_DIR, f), 'utf8')
      .split('\n')
      .map((line, i) => ({ where: `${f}:${i + 1}`, line: line.trim().replace(/^-\s+/, '') }))
      .filter(({ line }) => line.startsWith('uses:'))
      .filter(({ line }) => !/^uses:\s+(\.\/|docker:\/\/)/.test(line)),
  );

describe('GitHub Actions workflows pin third-party actions to a commit SHA', () => {
  it('finds at least one third-party action to check', () => {
    expect(usesLines.length).toBeGreaterThan(0);
  });

  it.each(usesLines)('$where is pinned to a full SHA with a version comment', ({ line }) => {
    expect(line).toMatch(PINNED);
  });
});
