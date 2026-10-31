// Previews legacy bcrypt accounts; imports them into Supabase Auth only with --apply.
import { create_password_auth_client } from '../src/platform/auth/supabase-auth-client.js';
import { provision_supabase_account } from '../src/platform/auth/supabase-account.js';

async function migrate_password_accounts() {
  if (process.env.DB_PROVIDER !== 'supabase') throw new Error('Set DB_PROVIDER=supabase for the intended test project');
  const apply = process.argv.includes('--apply');
  const client = create_password_auth_client();
  let offset = 0;
  while (true) {
    const { data, error } = await client.from('users').select('id,email,password_hash').order('id').range(offset, offset + 99);
    if (error) throw new Error('Could not read application accounts');
    if (!data.length) return;
    for (const user of data) {
      if (!/^\$2[aby]\$/.test(user.password_hash || '')) continue;
      if (apply) await import_password_account(client, user);
      console.log(`${apply ? 'Checked/imported' : 'Would check/import'} account ${user.id}`);
    }
    offset += data.length;
  }
}

async function import_password_account(client, user) {
  const { data, error } = await client.auth.admin.getUserById(user.id);
  if (data?.user?.id === user.id && data.user.email === user.email && data.user.app_metadata?.easycart_user_id === user.id) return;
  if (data?.user) throw new Error('Auth identity already exists; review it before continuing. No existing credentials were overwritten.');
  if (error?.status !== 404) throw new Error('Could not verify whether Auth identity exists');
  await provision_supabase_account(user, { password_hash: user.password_hash });
}

migrate_password_accounts().catch(() => {
  console.error('Migration stopped. Check the test project configuration and identity conflicts. Earlier imports may have completed; application rows were not changed.');
  process.exitCode = 1;
});
