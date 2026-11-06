import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error("usage: npm run user:create -- <username> <password>");
    process.exit(1);
  }
  const u = username.toLowerCase();
  if (!/^[a-z0-9_.]{3,32}$/.test(u)) {
    console.error("username must be 3-32 chars of [a-z0-9_.]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("password must be at least 8 characters");
    process.exit(1);
  }
  const { createAuth } = await import("../lib/auth");
  // Separate instance with sign-up allowed; the app's own instance keeps it disabled.
  const auth = createAuth({ allowSignUp: true });
  await auth.api.signUpEmail({
    body: { email: `${u}@pleybook.invalid`, password, name: u, username: u },
  });
  console.log(`created user "${u}"`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
