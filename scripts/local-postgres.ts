import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
// Development / automated tests only. Production must use a durable external database.
const directory=resolve('.local/postgres');
const pg=new EmbeddedPostgres({databaseDir:directory,user:'rokn',password:'local-development-only',port:5433,persistent:true,authMethod:'scram-sha-256',onLog:()=>{},onError:(error)=>console.error(error)});
if (!existsSync(resolve(directory,'PG_VERSION'))) await pg.initialise();
await pg.start();
const client=pg.getPgClient(); await client.connect();
for (const name of ['rokn','test_rokn']) {
  const result=await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[name]);
  if (!result.rowCount) await client.query(`CREATE DATABASE "${name}"`);
}
await client.end();
console.log('Local PostgreSQL ready on 127.0.0.1:5433 (development and test databases).');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await pg.stop();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
setInterval(()=>{},60_000);
