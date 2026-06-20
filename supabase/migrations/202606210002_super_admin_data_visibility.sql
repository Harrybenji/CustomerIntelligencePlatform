do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'datasets', 'customers', 'customer_records', 'campaigns', 'campaign_targets',
    'campaign_results', 'goals', 'imports', 'export_history', 'audit_logs'
  ] loop
    execute format('drop policy if exists super_admin_read on public.%I', table_name);
    execute format(
      'create policy super_admin_read on public.%I for select to authenticated using (public.is_super_admin())',
      table_name
    );
  end loop;
end;
$$;
