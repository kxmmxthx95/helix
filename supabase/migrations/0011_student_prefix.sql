-- Student name prefix (คำนำหน้า) — free text like profiles.prefix.
alter table students add column prefix text;

comment on column students.prefix is 'คำนำหน้า: เด็กชาย/เด็กหญิง/นาย/นางสาว/ฯลฯ — free text, not an enum';
