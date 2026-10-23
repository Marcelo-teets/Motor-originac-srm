// Only ciphertext may leave an ephemeral GitHub Actions runner.
// Envelope: 8-byte marker + 12-byte nonce + AES-256-GCM ciphertext + 16-byte tag.
// Keep the 256-bit recovery key outside GitHub artifacts and the repository.
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, appendFile, rm, stat } from 'node:fs/promises';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const MAGIC = Buffer.from('MOTORBK1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + IV_BYTES;

export const parseEncryptionKey = (encoded) => {
  const text = String(encoded ?? '').trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(text)) throw new Error('A securely stored 32-byte base64 recovery key is required.');
  const key = Buffer.from(text, 'base64');
  if (key.length !== 32 || key.toString('base64') !== text) {
    throw new Error('Recovery key must be exactly 32 random bytes in canonical base64.');
  }
  return key;
};

const readEnvelope = async (encryptedPath) => {
  const file = await open(encryptedPath, 'r');
  try {
    const length = (await file.stat()).size;
    if (length <= HEADER_BYTES + TAG_BYTES) throw new Error('Truncated encrypted recovery archive.');
    const header = Buffer.alloc(HEADER_BYTES);
    const tag = Buffer.alloc(TAG_BYTES);
    if ((await file.read(header, 0, header.length, 0)).bytesRead !== HEADER_BYTES ||
        (await file.read(tag, 0, TAG_BYTES, length - TAG_BYTES)).bytesRead !== TAG_BYTES ||
        !header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('Invalid encrypted recovery archive envelope.');
    }
    return { iv: header.subarray(MAGIC.length), tag, length };
  } finally {
    await file.close();
  }
};

export const verifyEncryptedArchive = async (encryptedPath, key, expectedSha256) => {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid AES-256 key.');
  const { iv, tag, length } = await readEnvelope(encryptedPath);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const digest = createHash('sha256');
  await pipeline(
    createReadStream(encryptedPath, { start: HEADER_BYTES, end: length - TAG_BYTES - 1 }),
    decipher,
    new Writable({ write(chunk, _encoding, callback) { digest.update(chunk); callback(); } }),
  );
  const actual = digest.digest('hex');
  if (actual !== expectedSha256) throw new Error('Recovery archive digest mismatch.');
  return { authenticated: true, sha256: actual, encryptedBytes: length };
};

// Recovery is explicit and local; decrypted plaintext is never uploaded by CI.
// A wrong key or tampered ciphertext deletes its incomplete output immediately.
export const decryptArchiveToFile = async (encryptedPath, plaintextPath, key) => {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid AES-256 key.');
  if (encryptedPath === plaintextPath) throw new Error('Source and destination must differ.');
  const { iv, tag, length } = await readEnvelope(encryptedPath);
  const output = await open(plaintextPath, 'wx', 0o600);
  await output.close();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(encryptedPath, { start: HEADER_BYTES, end: length - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(plaintextPath, { flags: 'w', mode: 0o600 }),
    );
    return { authenticated: true, plaintextBytes: (await stat(plaintextPath)).size };
  } catch (error) {
    await rm(plaintextPath, { force: true });
    throw error;
  }
};

export const encryptAndVerifyArchive = async (plaintextPath, encryptedPath, key) => {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid AES-256 key.');
  if ((await stat(plaintextPath)).size === 0) throw new Error('Refusing empty source export.');
  const iv = randomBytes(IV_BYTES);
  // Exclusive creation prevents accidental overwrite of an already archived backup.
  const output = await open(encryptedPath, 'wx', 0o600);
  try { await output.writeFile(Buffer.concat([MAGIC, iv])); }
  finally { await output.close(); }
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const digest = createHash('sha256');
  try {
    await pipeline(
      createReadStream(plaintextPath),
      new Transform({ transform(chunk, _encoding, callback) { digest.update(chunk); callback(null, chunk); } }),
      cipher,
      createWriteStream(encryptedPath, { flags: 'a', mode: 0o600 }),
    );
    await appendFile(encryptedPath, cipher.getAuthTag());
    const sha256 = digest.digest('hex');
    return await verifyEncryptedArchive(encryptedPath, key, sha256);
  } catch (error) {
    await rm(encryptedPath, { force: true });
    throw error;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const decrypt = args[0] === '--decrypt';
    const [source, destination] = decrypt ? args.slice(1) : args;
    if (!source || !destination || source === destination) {
      throw new Error('Provide separate input and output archive paths.');
    }
    const key = parseEncryptionKey(process.env.RECOVERY_ENCRYPTION_KEY_B64);
    if (decrypt) {
      const report = await decryptArchiveToFile(source, destination, key);
      console.log(JSON.stringify({ status: 'decrypted_and_authenticated', plaintextBytes: report.plaintextBytes }));
    } else {
      const report = await encryptAndVerifyArchive(source, destination, key);
      console.log(JSON.stringify({ status: 'encrypted_and_verified', authenticated: report.authenticated,
        encryptedBytes: report.encryptedBytes, envelope: 'AES-256-GCM/MOTORBK1' }));
    }
  } catch (error) {
    console.error('Recovery encryption gate failed:', error instanceof Error ? error.message : 'unknown');
    process.exitCode = 1;
  }
}
