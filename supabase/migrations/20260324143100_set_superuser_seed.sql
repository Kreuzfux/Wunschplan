-- Seed known global superuser after enum value exists.
update profiles
set role = 'superuser'
where lower(email) = lower('nitzschkepa@yahoo.de');
