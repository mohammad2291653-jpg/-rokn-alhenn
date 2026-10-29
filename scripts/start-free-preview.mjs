import { bootstrapFreePreview, FreePreviewBootstrapError } from './bootstrap-free-preview.mjs';

const controller = new AbortController();
let exitSignal;
const stop = signal => { exitSignal = signal; controller.abort(); };
const terminate = () => stop('SIGTERM');
const interrupt = () => stop('SIGINT');
process.once('SIGTERM', terminate);
process.once('SIGINT', interrupt);

try {
  const result = await bootstrapFreePreview({ signal: controller.signal });
  if (exitSignal) throw new Error('Interrupted.');
  process.removeListener('SIGTERM', terminate);
  process.removeListener('SIGINT', interrupt);
  console.info(JSON.stringify({ event: 'free-preview-bootstrap', result: 'passed', ...result }));
  // The standalone Next server now runs in this process and owns shutdown signals.
  // scripts/start.mjs preserves Render's PORT and binds HOSTNAME to 0.0.0.0.
  await import('./start.mjs');
} catch (error) {
  process.removeListener('SIGTERM', terminate);
  process.removeListener('SIGINT', interrupt);
  if (!exitSignal) console.error(JSON.stringify({ event: 'free-preview-start', result: 'failed', code: error instanceof FreePreviewBootstrapError ? error.code : 'PREVIEW_STARTUP_FAILED', message: error instanceof FreePreviewBootstrapError ? error.message : 'Free preview server could not start.' }));
  process.exitCode = exitSignal === 'SIGTERM' ? 143 : exitSignal === 'SIGINT' ? 130 : 1;
}
