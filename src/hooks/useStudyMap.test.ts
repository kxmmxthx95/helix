import { describe, it, expect, vi } from "vitest";
const { from, chain } = vi.hoisted(() => {
 const chain: Record<string, ReturnType<typeof vi.fn>> = {};
 for (const name of ['select','eq','single','upsert','update']) chain[name] = vi.fn(() => chain);
 return { from: vi.fn(() => chain), chain };
});
vi.mock('@/lib/supabase', () => ({ supabase: { from } }));
import { saveMapAssignment, renameStudyMap } from './useStudyMap';
describe('map persistence', () => {
 it('upserts only the selected subject and grade and reads back the row', async () => {
  chain.single!.mockResolvedValueOnce({data: {plan_subject_id:'s',grade_level_id:'g',map_id:'forest'},error:null});
  await expect(saveMapAssignment({plan_subject_id:'s',grade_level_id:'g',map_id:'forest'})).resolves.toMatchObject({map_id:'forest'});
  expect(chain.upsert).toHaveBeenCalledWith({plan_subject_id:'s',grade_level_id:'g',map_id:'forest'}, {onConflict:'plan_subject_id,grade_level_id'});
  expect(chain.select).toHaveBeenCalledWith('*');
 });
 it('rejects blank names without writing', async () => {
  from.mockClear();
  await expect(renameStudyMap({id:'forest',name:'  '})).rejects.toThrow();
  expect(from).not.toHaveBeenCalled();
 });
 it('propagates denied writes rather than reporting success', async () => {
  chain.single!.mockResolvedValueOnce({data:null,error:new Error('denied')});
  await expect(saveMapAssignment({plan_subject_id:'s',grade_level_id:'g',map_id:'forest'})).rejects.toThrow('denied');
 });
});
