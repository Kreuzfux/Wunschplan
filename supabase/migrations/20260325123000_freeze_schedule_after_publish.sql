-- Prevent schedule changes after publish except manual overrides.

create or replace function public.prevent_schedule_changes_after_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_status public.plan_status;
begin
  select mp.status into plan_status
  from public.monthly_plans mp
  where mp.id = coalesce(new.monthly_plan_id, old.monthly_plan_id)
  limit 1;

  if plan_status = 'published' then
    if tg_op = 'DELETE' then
      if coalesce(old.is_manual_override, false) is not true then
        raise exception 'Dienstplan ist veröffentlicht. Löschen nur als manueller Override erlaubt.';
      end if;
      return old;
    end if;

    -- INSERT/UPDATE
    if coalesce(new.is_manual_override, false) is not true then
      raise exception 'Dienstplan ist veröffentlicht. Änderungen nur als manueller Override erlaubt.';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_freeze_schedule_after_publish on public.schedule_assignments;
create trigger trg_freeze_schedule_after_publish
  before insert or update or delete on public.schedule_assignments
  for each row execute function public.prevent_schedule_changes_after_publish();

