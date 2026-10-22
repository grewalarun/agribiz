import dotenv from 'dotenv';

dotenv.config();

// Super admins are the emails listed in SUPER_ADMIN_EMAILS (comma separated)
function adminEmails() {
  return String(process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowlistedAdmin(email) {
  return adminEmails().includes(String(email ?? '').trim().toLowerCase());
}

// A user is a super admin only while their email stays in the allowlist
export function isSuperAdmin(user) {
  return user?.role === 'superadmin' && isAllowlistedAdmin(user.email);
}
