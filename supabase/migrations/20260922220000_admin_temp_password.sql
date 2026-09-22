-- Admin-visible last temp password (set when admin creates/resets the account).
-- Auth still stores only hashed passwords; this is an ops convenience for Hive admins.
-- Cleared when the user changes their own password.

alter table public.users
  add column if not exists admin_temp_password text;

comment on column public.users.admin_temp_password is
  'Last password set by an admin (temp). Not the Auth hash. Cleared after user password change.';
