create extension if not exists pgcrypto;

create table if not exists public.datasets (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  month smallint not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2200),
  start_date date not null,
  end_date date not null,
  file_name text not null,
  uploaded_at timestamptz not null default now(),
  total_records integer not null default 0 check (total_records >= 0),
  total_orders numeric(14,2) not null default 0 check (total_orders >= 0),
  active_customers integer not null default 0 check (active_customers >= 0),
  frequency numeric(14,4) not null default 0 check (frequency >= 0),
  is_latest boolean not null default false,
  status text not null default 'month-to-date' check (status in ('month-to-date', 'complete')),
  primary key (owner_id, id),
  check (end_date >= start_date)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  identity_key text not null,
  customer_name text not null default '',
  phone_number text,
  email text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, identity_key),
  unique (owner_id, id)
);

create table if not exists public.customer_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dataset_id text not null,
  customer_id uuid not null,
  customer_name text not null default '',
  phone_number text,
  email text,
  orders_this_month numeric(14,2) not null default 0 check (orders_this_month >= 0),
  lifetime_orders numeric(14,2) not null default 0 check (lifetime_orders >= 0),
  total_spend numeric(14,2) not null default 0 check (total_spend >= 0),
  last_order_date date,
  frequency_bucket text not null,
  trend_category text,
  recommended_action text,
  created_at timestamptz not null default now(),
  unique (owner_id, dataset_id, customer_id),
  foreign key (owner_id, dataset_id) references public.datasets(owner_id, id) on delete cascade,
  foreign key (owner_id, customer_id) references public.customers(owner_id, id) on delete restrict
);

create table if not exists public.campaigns (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  campaign_name text not null,
  campaign_type text not null,
  campaign_goal text not null,
  target_segment text not null default '',
  source_dataset_id text not null,
  snapshot_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'Waiting For New Snapshot',
  primary key (owner_id, id),
  foreign key (owner_id, source_dataset_id) references public.datasets(owner_id, id) on delete restrict
);

create table if not exists public.campaign_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id text not null,
  customer_id uuid not null,
  target_identity text not null,
  customer_name text not null default '',
  phone_number text,
  email text,
  orders_at_campaign_start numeric(14,2) not null default 0,
  target_orders numeric(14,2) not null default 0,
  bucket_at_campaign text,
  target_bucket text,
  total_spend_at_campaign numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, campaign_id, customer_id),
  foreign key (owner_id, campaign_id) references public.campaigns(owner_id, id) on delete cascade,
  foreign key (owner_id, customer_id) references public.customers(owner_id, id) on delete restrict
);

create table if not exists public.campaign_results (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id text not null,
  comparison_dataset_id text not null,
  customer_id uuid not null,
  orders_before numeric(14,2) not null default 0,
  orders_after numeric(14,2) not null default 0,
  movement numeric(14,2) not null default 0,
  result text not null,
  extra_orders_generated numeric(14,2) not null default 0,
  calculated_at timestamptz not null default now(),
  unique (owner_id, campaign_id, comparison_dataset_id, customer_id),
  foreign key (owner_id, campaign_id) references public.campaigns(owner_id, id) on delete cascade,
  foreign key (owner_id, comparison_dataset_id) references public.datasets(owner_id, id) on delete cascade,
  foreign key (owner_id, customer_id) references public.customers(owner_id, id) on delete restrict
);

create table if not exists public.goals (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  month smallint not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2200),
  target_orders numeric(14,2),
  target_frequency numeric(14,4),
  required_active_customers integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  unique (owner_id, month, year)
);

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dataset_id text not null,
  file_name text not null,
  imported_at timestamptz not null default now(),
  rows_imported integer not null default 0,
  validation_status text not null default 'valid',
  foreign key (owner_id, dataset_id) references public.datasets(owner_id, id) on delete cascade
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.export_history (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  dataset_id text,
  exported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (owner_id, id),
  foreign key (owner_id, dataset_id) references public.datasets(owner_id, id) on delete cascade
);

create index if not exists datasets_month_year_idx on public.datasets(owner_id, year, month);
create unique index if not exists datasets_one_latest_idx on public.datasets(owner_id, year, month) where is_latest;
create index if not exists datasets_uploaded_at_idx on public.datasets(owner_id, uploaded_at desc);
create index if not exists customers_email_idx on public.customers(owner_id, lower(email)) where email is not null;
create index if not exists customers_phone_idx on public.customers(owner_id, phone_number) where phone_number is not null;
create index if not exists customer_records_dataset_idx on public.customer_records(owner_id, dataset_id);
create index if not exists customer_records_email_idx on public.customer_records(owner_id, lower(email)) where email is not null;
create index if not exists customer_records_phone_idx on public.customer_records(owner_id, phone_number) where phone_number is not null;
create index if not exists campaign_targets_campaign_idx on public.campaign_targets(owner_id, campaign_id);
create index if not exists campaign_results_campaign_idx on public.campaign_results(owner_id, campaign_id);
create index if not exists campaign_results_dataset_idx on public.campaign_results(owner_id, comparison_dataset_id);
create index if not exists goals_month_year_idx on public.goals(owner_id, year, month);
create index if not exists imports_dataset_idx on public.imports(owner_id, dataset_id);
create index if not exists audit_logs_entity_idx on public.audit_logs(owner_id, entity_type, entity_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at before update on public.goals for each row execute function public.set_updated_at();

create or replace function public.import_dataset_snapshot(p_dataset jsonb, p_replace_dataset_id text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_dataset_id text := coalesce(nullif(p_dataset->>'id', ''), gen_random_uuid()::text);
  v_month integer := (p_dataset->>'month')::integer;
  v_year integer := (p_dataset->>'year')::integer;
  v_start_date date := (p_dataset->>'startDate')::date;
  v_end_date date := (p_dataset->>'endDate')::date;
  v_uploaded_at timestamptz := coalesce((p_dataset->>'uploadedAt')::timestamptz, now());
  v_customer jsonb;
  v_customer_id uuid;
  v_identity text;
  v_orders numeric;
  v_total_records integer;
  v_total_orders numeric;
  v_active_customers integer;
  v_replacing boolean;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if v_month not between 1 and 12 or v_end_date < v_start_date then raise exception 'Invalid dataset period'; end if;
  if jsonb_typeof(p_dataset->'customers') <> 'array' or jsonb_array_length(p_dataset->'customers') = 0 then
    raise exception 'A dataset must contain at least one customer record';
  end if;

  select exists(
    select 1 from public.datasets where owner_id = v_owner and id = p_replace_dataset_id
  ) into v_replacing;

  update public.datasets set is_latest = false
  where owner_id = v_owner and year = v_year and month = v_month and is_latest;

  if v_replacing then
    if p_replace_dataset_id <> v_dataset_id then raise exception 'Replacement id must match the existing dataset'; end if;
    delete from public.customer_records where owner_id = v_owner and dataset_id = v_dataset_id;
    update public.datasets set
      month = v_month, year = v_year, start_date = v_start_date, end_date = v_end_date,
      file_name = coalesce(nullif(p_dataset->>'fileName', ''), 'Uploaded customer file'),
      uploaded_at = v_uploaded_at, is_latest = true,
      status = coalesce(nullif(p_dataset->>'status', ''), 'month-to-date')
    where owner_id = v_owner and id = v_dataset_id;
  else
    insert into public.datasets(owner_id, id, month, year, start_date, end_date, file_name, uploaded_at, is_latest, status)
    values (
      v_owner, v_dataset_id, v_month, v_year, v_start_date, v_end_date,
      coalesce(nullif(p_dataset->>'fileName', ''), 'Uploaded customer file'), v_uploaded_at, true,
      coalesce(nullif(p_dataset->>'status', ''), 'month-to-date')
    );
  end if;

  for v_customer in select value from jsonb_array_elements(p_dataset->'customers') loop
    v_identity := case
      when nullif(trim(v_customer->>'email'), '') is not null then 'email:' || lower(trim(v_customer->>'email'))
      when nullif(trim(v_customer->>'phoneNumber'), '') is not null then 'phone:' || lower(trim(v_customer->>'phoneNumber'))
      else 'name:' || lower(regexp_replace(trim(coalesce(v_customer->>'customerName', '')), '\s+', ' ', 'g'))
    end;
    if v_identity in ('name:', 'email:', 'phone:') then raise exception 'Every row needs a name, phone number, or email'; end if;
    v_orders := greatest(coalesce((v_customer->>'ordersThisMonth')::numeric, 0), 0);

    insert into public.customers(owner_id, identity_key, customer_name, phone_number, email, first_seen_at, last_seen_at)
    values (
      v_owner, v_identity, coalesce(v_customer->>'customerName', ''), nullif(v_customer->>'phoneNumber', ''),
      nullif(lower(v_customer->>'email'), ''), v_uploaded_at, v_uploaded_at
    )
    on conflict (owner_id, identity_key) do update set
      customer_name = excluded.customer_name,
      phone_number = coalesce(excluded.phone_number, public.customers.phone_number),
      email = coalesce(excluded.email, public.customers.email),
      last_seen_at = greatest(public.customers.last_seen_at, excluded.last_seen_at)
    returning id into v_customer_id;

    insert into public.customer_records(
      owner_id, dataset_id, customer_id, customer_name, phone_number, email, orders_this_month,
      lifetime_orders, total_spend, last_order_date, frequency_bucket, trend_category, recommended_action, created_at
    ) values (
      v_owner, v_dataset_id, v_customer_id, coalesce(v_customer->>'customerName', ''),
      nullif(v_customer->>'phoneNumber', ''), nullif(lower(v_customer->>'email'), ''), v_orders,
      greatest(coalesce((v_customer->>'lifetimeOrders')::numeric, 0), 0),
      greatest(coalesce((v_customer->>'totalSpend')::numeric, 0), 0),
      nullif(v_customer->>'lastOrderDate', '')::date,
      case when v_orders <= 0 then '0 Orders' when v_orders >= 5 then '5+ Orders'
        when v_orders = 1 then '1 Order' else v_orders::text || ' Orders' end,
      nullif(v_customer->>'trendCategory', ''), nullif(v_customer->>'recommendedAction', ''), v_uploaded_at
    );
  end loop;

  select count(*), coalesce(sum(orders_this_month), 0), count(*) filter (where orders_this_month > 0)
  into v_total_records, v_total_orders, v_active_customers
  from public.customer_records where owner_id = v_owner and dataset_id = v_dataset_id;

  update public.datasets set
    total_records = v_total_records,
    total_orders = v_total_orders,
    active_customers = v_active_customers,
    frequency = case when v_active_customers > 0 then v_total_orders / v_active_customers else 0 end
  where owner_id = v_owner and id = v_dataset_id;

  insert into public.imports(owner_id, dataset_id, file_name, imported_at, rows_imported, validation_status)
  values (v_owner, v_dataset_id, coalesce(p_dataset->>'fileName', 'Uploaded customer file'), now(), v_total_records, 'valid');

  insert into public.campaign_results(
    owner_id, campaign_id, comparison_dataset_id, customer_id, orders_before, orders_after,
    movement, result, extra_orders_generated, calculated_at
  )
  select
    v_owner, c.id, v_dataset_id, ct.customer_id, ct.orders_at_campaign_start,
    coalesce(cr.orders_this_month, 0), coalesce(cr.orders_this_month, 0) - ct.orders_at_campaign_start,
    case
      when cr.id is null then 'Data Mismatch'
      when cr.orders_this_month > ct.target_orders then 'Exceeded Target'
      when cr.orders_this_month >= ct.target_orders then 'Converted'
      when cr.orders_this_month > ct.orders_at_campaign_start then 'Partially Progressed'
      when cr.orders_this_month = 0 and ct.orders_at_campaign_start > 0 then 'Newly Inactive'
      else 'No Movement'
    end,
    greatest(coalesce(cr.orders_this_month, 0) - ct.orders_at_campaign_start, 0), now()
  from public.campaigns c
  join public.datasets source on source.owner_id = c.owner_id and source.id = c.source_dataset_id
  join public.campaign_targets ct on ct.owner_id = c.owner_id and ct.campaign_id = c.id
  left join public.customer_records cr on cr.owner_id = c.owner_id and cr.dataset_id = v_dataset_id and cr.customer_id = ct.customer_id
  where c.owner_id = v_owner and source.year = v_year and source.month = v_month
    and source.id <> v_dataset_id and source.end_date <= v_end_date
  on conflict (owner_id, campaign_id, comparison_dataset_id, customer_id) do update set
    orders_after = excluded.orders_after,
    movement = excluded.movement,
    result = excluded.result,
    extra_orders_generated = excluded.extra_orders_generated,
    calculated_at = excluded.calculated_at;

  update public.campaigns c set status = 'Measuring'
  from public.datasets source
  where c.owner_id = v_owner and source.owner_id = c.owner_id and source.id = c.source_dataset_id
    and source.year = v_year and source.month = v_month and source.id <> v_dataset_id and source.end_date <= v_end_date;

  insert into public.audit_logs(owner_id, action, entity_type, entity_id, metadata)
  values (v_owner, case when v_replacing then 'data_replaced' else 'data_uploaded' end, 'dataset', v_dataset_id,
    jsonb_build_object('records', v_total_records, 'file_name', p_dataset->>'fileName'));
  return v_dataset_id;
end;
$$;

create or replace function public.create_campaign_with_targets(p_campaign jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_campaign_id text := coalesce(nullif(p_campaign->>'id', ''), gen_random_uuid()::text);
  v_target jsonb;
  v_customer_id uuid;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_campaign->'targetCustomers') <> 'array' or jsonb_array_length(p_campaign->'targetCustomers') = 0 then
    raise exception 'Campaigns require at least one frozen target';
  end if;

  insert into public.campaigns(
    owner_id, id, campaign_name, campaign_type, campaign_goal, target_segment,
    source_dataset_id, snapshot_label, created_at, status
  ) values (
    v_owner, v_campaign_id, p_campaign->>'campaignName', p_campaign->>'campaignType', p_campaign->>'campaignGoal',
    coalesce(p_campaign->>'targetSegment', ''), p_campaign->>'snapshotId', coalesce(p_campaign->>'snapshotLabel', ''),
    coalesce((p_campaign->>'createdAt')::timestamptz, now()), coalesce(p_campaign->>'status', 'Waiting For New Snapshot')
  );

  for v_target in select value from jsonb_array_elements(p_campaign->'targetCustomers') loop
    select id into v_customer_id from public.customers
    where owner_id = v_owner and identity_key = v_target->>'customerId';
    if v_customer_id is null then raise exception 'Campaign target is not present in the customer database'; end if;
    insert into public.campaign_targets(
      owner_id, campaign_id, customer_id, target_identity, customer_name, phone_number, email,
      orders_at_campaign_start, target_orders, bucket_at_campaign, target_bucket, total_spend_at_campaign
    ) values (
      v_owner, v_campaign_id, v_customer_id, v_target->>'customerId', coalesce(v_target->>'customerName', ''),
      nullif(v_target->>'phoneNumber', ''), nullif(v_target->>'email', ''),
      coalesce((v_target->>'ordersAtCampaign')::numeric, 0), coalesce((v_target->>'targetOrders')::numeric, 0),
      v_target->>'bucketAtCampaign', v_target->>'targetBucket', coalesce((v_target->>'totalSpendAtCampaign')::numeric, 0)
    );
  end loop;

  insert into public.audit_logs(owner_id, action, entity_type, entity_id, metadata)
  values (v_owner, 'campaign_created', 'campaign', v_campaign_id,
    jsonb_build_object('targets', jsonb_array_length(p_campaign->'targetCustomers')));
  return v_campaign_id;
end;
$$;

create or replace function public.delete_dataset_snapshot(p_dataset_id text, p_confirmation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_month integer;
  v_year integer;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p_confirmation <> 'DELETE' then raise exception 'Permanent delete requires DELETE confirmation'; end if;
  select month, year into v_month, v_year from public.datasets where owner_id = v_owner and id = p_dataset_id;
  if not found then raise exception 'Dataset not found'; end if;
  if exists (select 1 from public.campaigns where owner_id = v_owner and source_dataset_id = p_dataset_id) then
    raise exception 'This dataset is a frozen campaign source and cannot be deleted while that campaign exists';
  end if;
  delete from public.datasets where owner_id = v_owner and id = p_dataset_id;
  update public.datasets set is_latest = false where owner_id = v_owner and year = v_year and month = v_month;
  update public.datasets set is_latest = true
  where owner_id = v_owner and id = (
    select id from public.datasets where owner_id = v_owner and year = v_year and month = v_month
    order by end_date desc, uploaded_at desc limit 1
  );
  insert into public.audit_logs(owner_id, action, entity_type, entity_id, metadata)
  values (v_owner, 'data_deleted', 'dataset', p_dataset_id, jsonb_build_object('permanent', true));
end;
$$;

alter table public.datasets enable row level security;
alter table public.customers enable row level security;
alter table public.customer_records enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_targets enable row level security;
alter table public.campaign_results enable row level security;
alter table public.goals enable row level security;
alter table public.imports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.export_history enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'datasets', 'customers', 'customer_records', 'campaigns', 'campaign_targets',
    'campaign_results', 'goals', 'imports', 'export_history'
  ] loop
    execute format('drop policy if exists owner_access on public.%I', table_name);
    execute format(
      'create policy owner_access on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      table_name
    );
  end loop;
end;
$$;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (owner_id = auth.uid());

revoke all on public.datasets, public.customers, public.customer_records, public.campaigns,
  public.campaign_targets, public.campaign_results, public.goals, public.imports,
  public.audit_logs, public.export_history from anon;
revoke all on public.datasets, public.customers, public.customer_records, public.campaigns,
  public.campaign_targets, public.campaign_results, public.goals, public.imports,
  public.audit_logs, public.export_history from authenticated;
grant select on public.datasets, public.customers, public.customer_records, public.campaigns,
  public.campaign_targets, public.campaign_results, public.goals, public.imports,
  public.audit_logs, public.export_history to authenticated;
grant insert, update on public.goals to authenticated;
grant insert on public.export_history to authenticated;
revoke all on function public.import_dataset_snapshot(jsonb, text) from public, anon;
revoke all on function public.create_campaign_with_targets(jsonb) from public, anon;
revoke all on function public.delete_dataset_snapshot(text, text) from public, anon;
grant execute on function public.import_dataset_snapshot(jsonb, text) to authenticated;
grant execute on function public.create_campaign_with_targets(jsonb) to authenticated;
grant execute on function public.delete_dataset_snapshot(text, text) to authenticated;
