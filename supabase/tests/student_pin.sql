-- Verifies 0158 (student PIN gate on big sales) against a real project; everything rolls back.
-- Run manually after applying 0158. Needs one org-wide profile and one student with an active card.
begin;
do $$
declare
  uid uuid; sid uuid; cid uuid; cuid text; r jsonb; i int;
begin
  -- act as an org-wide user so can_pos() / is_org_wide() pass
  for uid in select id from profiles where is_active loop
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    exit when is_org_wide();
  end loop;
  if not is_org_wide() then raise exception 'no org-wide profile found'; end if;

  select student_id, id, card_uid into strict sid, cid, cuid from student_cards where status = 'active' limit 1;
  insert into card_transactions (student_id, card_id, type, amount, recorded_by) values (sid, cid, 'topup_cash', 1000, uid);
  insert into student_wallets (student_id) values (sid) on conflict (student_id) do update set daily_limit = null;
  update card_settings set pin_threshold = 100;
  delete from student_pins where student_id = sid;

  r := pos_sale(cuid, 150);
  if not (r->>'ok')::boolean then raise exception 'no PIN set: sale should pass, got %', r; end if;

  insert into student_pins (student_id, pin_hash) values (sid, extensions.crypt('1234', extensions.gen_salt('bf')));

  r := pos_sale(cuid, 99);
  if not (r->>'ok')::boolean then raise exception 'below threshold must not need a PIN, got %', r; end if;

  r := pos_sale(cuid, 100);
  if (r->>'ok')::boolean or r->>'status' <> 'pin_required' then raise exception 'expected pin_required, got %', r; end if;

  r := pos_sale(cuid, 100, null, null, '0000');
  if (r->>'ok')::boolean or r->>'status' <> 'bad' or (r->>'attempts_left')::int <> 4 then raise exception 'expected bad/4, got %', r; end if;

  r := pos_sale(cuid, 100, null, null, '1234');
  if not (r->>'ok')::boolean then raise exception 'correct PIN should pass, got %', r; end if;

  for i in 1..5 loop r := pos_sale(cuid, 100, null, null, '0000'); end loop;
  if r->>'status' <> 'locked' then raise exception 'expected locked after 5 wrong, got %', r; end if;
  r := pos_sale(cuid, 100, null, null, '1234');
  if r->>'status' <> 'locked' then raise exception 'correct PIN must not unlock early, got %', r; end if;
  r := pos_sale(cuid, 50);
  if not (r->>'ok')::boolean then raise exception 'small sale must pass while locked, got %', r; end if;
end $$;
rollback;
