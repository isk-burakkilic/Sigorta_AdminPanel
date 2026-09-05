// ============================================================
//  set_role.mjs — bir kullanıcıya yönetici yetkisi verir / geri alır.
//
//  Kullanım:
//    node scripts/set_role.mjs <acente> <kullanıcı_adı> <admin|user>
//  Örnek:
//    node scripts/set_role.mjs ahenk burakkilic admin
//
//  'admin' rolü: tüm acentelere giriş + panelden kullanıcı yönetimi.
//  Şifre hash'lerine dokunmaz; yalnızca role alanını değiştirir.
// ============================================================
import { setRole, getUser, listUsers } from '../src/users.js';

const [, , tenant, username, role] = process.argv;
if (!tenant || !username || !['admin', 'user'].includes(role)) {
  console.error('Kullanım: node scripts/set_role.mjs <acente> <kullanıcı_adı> <admin|user>');
  process.exit(1);
}
if (!getUser(tenant, username)) {
  console.error(`❌ Kullanıcı bulunamadı: '${username}' (acente: ${tenant})`);
  process.exit(1);
}

setRole(tenant, username, role);
console.log(`✅ '${username}' (${tenant}) → yetki: ${role}`);
const admins = listUsers().filter((u) => u.role === 'admin').map((u) => `${u.username}@${u.tenant}`);
console.log(`   Sistemdeki yöneticiler: ${admins.join(', ') || '(yok)'}`);
