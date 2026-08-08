-- Rename display labels for the three starter departments.
update departments set name = 'ปฐมวัย' where code = 'KG' and name = 'อนุบาล';
update departments set name = 'ประถมศึกษา' where code = 'PRI' and name = 'ประถม';
update departments set name = 'มัธยมศึกษา' where code = 'SEC' and name = 'มัธยม';
