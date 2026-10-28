-- customers table
create table customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  balance_owed numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- products table
create table products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  unit text not null default 'item',
  price numeric(12,2),
  stock_qty numeric(12,2) not null default 0,
  low_stock_level numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- transactions table
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  type text not null check (type in ('sale', 'payment', 'restock')),
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

-- transaction items table
create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  qty numeric(12,2) not null,
  unit_price numeric(12,2)
);

-- reminders table
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  message text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- voice logs table
create table voice_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transcript text not null,
  parsed_json jsonb,
  status text not null default 'parsed' check (status in ('parsed', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);

-- turn on row level security
alter table customers enable row level security;
alter table products enable row level security;
alter table transactions enable row level security;
alter table transaction_items enable row level security;
alter table reminders enable row level security;
alter table voice_logs enable row level security;

-- each user only sees their own rows
create policy "own customers" on customers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own products" on products for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own transactions" on transactions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own reminders" on reminders for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own voice logs" on voice_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- items belong to the user through their transaction
create policy "own items" on transaction_items for all
  using (exists (select 1 from transactions t where t.id = transaction_id and t.user_id = auth.uid()))
  with check (exists (select 1 from transactions t where t.id = transaction_id and t.user_id = auth.uid()));