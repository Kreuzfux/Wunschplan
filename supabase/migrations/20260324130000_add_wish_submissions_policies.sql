-- Enable employee/admin access for wish_submissions under RLS.

create policy "Employees manage own submissions"
    on wish_submissions for all using (
        employee_id = auth.uid()
    )
    with check (
        employee_id = auth.uid()
    );

create policy "Admins view all submissions"
    on wish_submissions for select using (
        exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    );

create policy "Admins manage submissions"
    on wish_submissions for all using (
        exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    )
    with check (
        exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    );
