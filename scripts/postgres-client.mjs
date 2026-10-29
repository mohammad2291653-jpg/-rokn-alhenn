import { spawn } from "node:child_process";

// libpq does not expand a connection URI placed in PGDATABASE alone. Pass each
// connection field through the environment so passwords never enter argv/logs.
const [variableName, executable, ...args] = process.argv.slice(2);
if (!["DATABASE_URL", "RESTORE_DATABASE_URL"].includes(variableName) || !["pg_dump", "pg_restore", "psql"].includes(executable)) {
  console.error("Use a supported PostgreSQL URL environment variable and client command.");
  process.exit(1);
}
const queryVariables = {
  host: "PGHOST", hostaddr: "PGHOSTADDR", port: "PGPORT", user: "PGUSER", password: "PGPASSWORD", dbname: "PGDATABASE",
  sslmode: "PGSSLMODE", sslrootcert: "PGSSLROOTCERT", sslcert: "PGSSLCERT", sslkey: "PGSSLKEY", sslcrl: "PGSSLCRL", sslcrldir: "PGSSLCRLDIR",
  ssl_min_protocol_version: "PGSSLMINPROTOCOLVERSION", ssl_max_protocol_version: "PGSSLMAXPROTOCOLVERSION", sslnegotiation: "PGSSLNEGOTIATION",
  channel_binding: "PGCHANNELBINDING", gssencmode: "PGGSSENCMODE", krbsrvname: "PGKRBSRVNAME", gsslib: "PGGSSLIB",
  connect_timeout: "PGCONNECT_TIMEOUT", target_session_attrs: "PGTARGETSESSIONATTRS", load_balance_hosts: "PGLOADBALANCEHOSTS",
  application_name: "PGAPPNAME", options: "PGOPTIONS", passfile: "PGPASSFILE", client_encoding: "PGCLIENTENCODING",
  require_auth: "PGREQUIREAUTH", requirepeer: "PGREQUIREPEER",
};
let clientEnvironment;
try {
  const url = new URL(process.env[variableName]);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length <= 1) throw new Error("invalid");
  clientEnvironment = {
    ...process.env,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
  // Ambient libpq service/host-address selectors must not redirect this URL.
  delete clientEnvironment.PGSERVICE;
  delete clientEnvironment.PGSERVICEFILE;
  delete clientEnvironment.PGHOSTADDR;
  for (const [key, value] of url.searchParams) {
    if (key === "schema") continue; // Prisma-only query parameter; dump all schemas.
    const environmentVariable = queryVariables[key];
    if (!environmentVariable) {
      console.error("Unsupported PostgreSQL URL query parameter. Use a direct libpq-compatible database URL.");
      process.exit(1);
    }
    clientEnvironment[environmentVariable] = value;
  }
} catch {
  console.error("Invalid PostgreSQL database URL.");
  process.exit(1);
}
// pg_restore selects SQL-file output unless a database option is present. The
// database name is harmless in argv; all authentication fields remain in env.
if (executable === "pg_restore") args.unshift("--dbname", clientEnvironment.PGDATABASE);
const child = spawn(executable, args, { env: clientEnvironment, stdio: "inherit" });
child.on("error", () => { console.error("Could not start the PostgreSQL client."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
