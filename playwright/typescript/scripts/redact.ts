/**
 * Stdin → redactSensitive → stdout CLI.
 *
 * Lets the Python self-healing script (scripts/self-healing.py, issue #402)
 * route LLM-bound text through the same regex set as the TS code path,
 * keeping redactSensitive in utils/diagnosis.util.ts as the single source
 * of truth.
 */
import { redactSensitive } from '../utils/diagnosis.util.ts';

const chunks: Buffer[] = [];
process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
process.stdin.on('end', () => {
  process.stdout.write(redactSensitive(Buffer.concat(chunks).toString('utf8')));
});
