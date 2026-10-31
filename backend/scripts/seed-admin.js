// One-off script to create the first platform_admin user. Run manually:
//   node scripts/seed-admin.js <email> <password> <username>
import { randomUUID } from 'node:crypto';
import { connect_db } from '../src/platform/db/db.js';
import { save_password_account } from '../src/platform/auth/account-passwords.js';
import { find_user_by_email } from '../src/modules/users/repositories/user-repository.js';

async function main() {
  const [email, password, username] = process.argv.slice(2);
  if (!email || !password || !username) {
    console.error('Usage: node scripts/seed-admin.js <email> <password> <username>');
    process.exit(1);
  }

  await connect_db();

  const existing = await find_user_by_email(email);
  if (existing) {
    console.error(`A user with email ${email} already exists.`);
    process.exit(1);
  }

  await save_password_account({
    id: randomUUID(),
    username,
    email,
    phone_number: '0000000000',
    role: 'platform_admin',
    tenant_id: null
  }, password);

  console.log(`Created platform_admin user: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
