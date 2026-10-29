// Deployment providers inject secrets; local reviewers can use Node's --env-file-if-exists.
process.env.HOSTNAME=process.env.BIND_HOST || '0.0.0.0';
await import('../.next/standalone/server.js');
