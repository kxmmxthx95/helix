-- แคชเชียร์ (cashier): staff account that only runs the บัตรเติมเงิน POS screen —
-- no tuition, student lists or other menus. Split from 0107 because a new enum
-- value can't be used in the transaction that adds it (same as 0081).
alter type app_role add value if not exists 'cashier';
