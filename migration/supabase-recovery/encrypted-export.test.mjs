import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { decryptArchiveToFile, encryptAndVerifyArchive, parseEncryptionKey, verifyEncryptedArchive } from './encrypted-export.mjs';

test('round-trip authenticates a binary source backup without writing decrypted files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'motor-encrypted-recovery-'));
  try {
    const source = join(dir, 'source.tar.gz');
    const encrypted = join(dir, 'source.encrypted');
    const plaintext = randomBytes(1048576 + 37);
    const key = parseEncryptionKey(randomBytes(32).toString('base64'));
    await writeFile(source, plaintext);
    const report = await encryptAndVerifyArchive(source, encrypted, key);
    assert.equal(report.authenticated, true);
    assert.ok(report.encryptedBytes > plaintext.length);
    assert.equal((await readFile(encrypted)).includes(plaintext.subarray(0, 128)), false);
    assert.deepEqual(await verifyEncryptedArchive(encrypted, key, report.sha256), report);
    const restored = join(dir, 'restored.tar.gz');
    assert.deepEqual(await decryptArchiveToFile(encrypted, restored, key), { authenticated: true, plaintextBytes: plaintext.length });
    assert.deepEqual(await readFile(restored), plaintext);
    const wrongRestore = join(dir, 'wrong.tar.gz');
    await assert.rejects(decryptArchiveToFile(encrypted, wrongRestore, randomBytes(32)));
    await assert.rejects(readFile(wrongRestore), /ENOENT/);
    await assert.rejects(encryptAndVerifyArchive(source, encrypted, key), /EEXIST/);
    await assert.rejects(verifyEncryptedArchive(encrypted, randomBytes(32), report.sha256));
    const changed = await readFile(encrypted);
    changed[30] ^= 1;
    await writeFile(encrypted, changed);
    await assert.rejects(verifyEncryptedArchive(encrypted, key, report.sha256));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('no missing, malformed or non-256-bit key may authorize export', async () => {
  for (const value of ['', undefined, 'password', randomBytes(16).toString('base64'), 'A'.repeat(44)]) {
    assert.throws(() => parseEncryptionKey(value), /key|Key|bytes/);
  }
  assert.equal(parseEncryptionKey(randomBytes(32).toString('base64')).length, 32);
});

test('rejects empty or truncated backups instead of publishing them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'motor-encrypted-recovery-invalid-'));
  try {
    const source = join(dir, 'empty');
    const encrypted = join(dir, 'encrypted');
    const key = randomBytes(32);
    await writeFile(source, '');
    await assert.rejects(encryptAndVerifyArchive(source, encrypted, key), /empty/);
    await writeFile(encrypted, 'MOTORBK1');
    await assert.rejects(verifyEncryptedArchive(encrypted, key, '0'.repeat(64)), /Truncated/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('legacy recovery workflow never uploads unencrypted source data', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/legacy-data-recovery.yml', import.meta.url), 'utf8');
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /RECOVERY_ENCRYPTION_KEY_B64/);
  assert.match(workflow, /tar -C "\$EXPORT_ROOT" -czf/);
  assert.match(workflow, /encrypted-export\.mjs/);
  assert.match(workflow, /name: Upload encrypted backup only/);
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/supabase-recovery-encrypted\.bin/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.ok(workflow.indexOf('Enforce complete backup') < workflow.indexOf('Encrypt and authenticate complete backup'));
  assert.ok(workflow.indexOf('Encrypt and authenticate complete backup') < workflow.indexOf('Upload encrypted backup only'));
  assert.doesNotMatch(workflow, /path:\s*tmp\/supabase-full-export/);
  assert.doesNotMatch(workflow, /name: Upload export artifact/);
});
