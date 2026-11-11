// Prints SQL that creates a verified email/password account (+ profile).
// Usage: node scripts/create-user.mjs <email> <username> "<Display Name>" [admin] > /tmp/u.sql
//   then: npx wrangler d1 execute commonground --remote --file /tmp/u.sql
// Password is generated and printed to stderr only.
import { hashPassword } from "better-auth/crypto";
import { randomBytes, randomUUID } from "node:crypto";

const [email, username, displayName, role] = process.argv.slice(2);
if (!email || !username || !displayName) { console.error("usage: email username 'Display Name' [admin]"); process.exit(1); }
const password = randomBytes(9).toString("base64url");
const hash = await hashPassword(password);
const id = randomUUID();
const now = Date.now();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
console.log(`INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (${q(id)},${q(displayName)},${q(email.toLowerCase())},1,${now},${now});
INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES (${q(randomUUID())},${q(id)},'credential',${q(id)},${q(hash)},${now},${now});
INSERT INTO profiles (user_id,username,display_name,bio,platform_role,onboarded_at,collab_prefs) VALUES (${q(id)},${q(username)},${q(displayName)},'Building CommonGround.',${q(role === "admin" ? "admin" : "member")},${now},'{"openTo":["projects","mentoring"]}');
INSERT INTO user_interests (user_id,category) VALUES (${q(id)},'technology'),(${q(id)},'community'),(${q(id)},'education');`);
console.error(`USER_ID=${id}\nPASSWORD=${password}`);
