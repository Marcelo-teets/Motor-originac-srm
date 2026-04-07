-- Final CRM hardening: owner and activity type constraints/defaults
alter table if exists pipeline alter column owner set default 'Unknown';
alter table if exists activities alter column owner set default 'Unknown';
alter table if exists tasks alter column owner set default 'Unknown';
alter table if exists activities alter column type set default 'other';

alter table if exists activities drop constraint if exists chk_activities_type;
alter table if exists activities add constraint chk_activities_type check (type in ('follow_up','meeting','email','call','research','committee','other'));

alter table if exists pipeline drop constraint if exists chk_pipeline_owner;
alter table if exists pipeline add constraint chk_pipeline_owner check (owner in ('Origination','Coverage','Analytics','Intelligence','Credit','Unknown'));

alter table if exists activities drop constraint if exists chk_activities_owner;
alter table if exists activities add constraint chk_activities_owner check (owner in ('Origination','Coverage','Analytics','Intelligence','Credit','Unknown'));

alter table if exists tasks drop constraint if exists chk_tasks_owner;
alter table if exists tasks add constraint chk_tasks_owner check (owner in ('Origination','Coverage','Analytics','Intelligence','Credit','Unknown'));
