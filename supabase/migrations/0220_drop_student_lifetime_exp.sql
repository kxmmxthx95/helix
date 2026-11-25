-- Lifetime rank/EXP removed from the student home (slow RLS-bound aggregate); rank now follows the term EXP.
drop function if exists student_lifetime_exp();
