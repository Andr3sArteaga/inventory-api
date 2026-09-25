import { Client } from 'pg';

// decision: this reads DATABASE_URL from process.env directly, with no `dotenv/config`
// import of its own. The npm script that runs this file loads .env.test via `dotenv-cli`
// BEFORE this process starts, so DATABASE_URL is already the test database's URL by the
// time this code runs — adding our own dotenv call here would just load the DEFAULT
// .env redundantly (harmlessly, since dotenv never overrides an already-set var, but
// it's one less thing to reason about).
async function main() {
  const testUrl = process.env.DATABASE_URL;
  if (!testUrl) {
    throw new Error('DATABASE_URL is not set — run this via `npm run test:e2e:setup`');
  }

  const url = new URL(testUrl);
  const dbName = url.pathname.replace(/^\//, '');
  if (!dbName) {
    throw new Error(`DATABASE_URL has no database name: ${testUrl}`);
  }

  // Connect to the same Postgres server's default "postgres" database — you can't
  // create a database while connected to it, and the target database may not exist yet.
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();

  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    dbName,
  ]);

  if (rowCount === 0) {
    // Identifiers can't be parameterized in SQL; dbName comes from our own trusted
    // .env.test, never from user input, so building the statement this way is safe here.
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database "${dbName}"`);
  } else {
    console.log(`Database "${dbName}" already exists`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
