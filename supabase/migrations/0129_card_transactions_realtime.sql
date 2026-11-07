-- Parent/student portal shows the balance live: broadcast card_transactions changes (insert on top-up/sale, update on void).
-- RLS (card_transactions_read) still decides who receives which row. Rollback: alter publication supabase_realtime drop table card_transactions.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'card_transactions') then
    alter publication supabase_realtime add table card_transactions;
  end if;
end $$;
