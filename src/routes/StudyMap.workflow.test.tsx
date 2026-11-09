import { act } from 'react';
vi.mock('@/components/icons', () => ({ LocationIcon: () => null }));
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ save: vi.fn(), rename: vi.fn(), open: vi.fn(), assignment: null }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({profile:{roles:['super_admin']}}) }));
vi.mock('@/hooks/useProfiles', () => ({ useDepartments: () => ({data:[{id:'d',name:'Secondary'}]}) }));
vi.mock('@/hooks/useCurriculumStructure', () => ({useGradeLevels: () => ({data:[{id:'g',code:'M1'}]})}));
vi.mock('@/hooks/usePlan', () => ({
 usePlanSubjects: () => ({data:[{id:'s',name:'Math',gradeLevelIds:['g']}]}),
 usePlanOutline: () => ({data:[{id:'l',name:'Algebra',grade_level_id:'g',files:[{linkId:'f',file:{title:'Lesson PDF',file_path:'real/path'}}],topics:[{id:'t',name:'Equations',files:[]}]}]}),
 openDocFile: m.open,
}));
vi.mock('@/hooks/useStudyMap', () => ({
 useStudyMapLibrary: () => ({data:[{id:'forest',theme:'forest',name:'Forest'}]}),
 useStudyMapAssignment: () => ({data:m.assignment}),
 useSaveMapAssignment: () => ({mutateAsync:m.save}), useRenameStudyMap: () => ({mutateAsync:m.rename}),
}));
vi.mock('@/components/StudyMap/ForestScene', () => ({ ForestScene: () => <div>3D preview</div> }));
import { StudyMap } from './StudyMap';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => {if(root) await act(async()=>root.unmount()); document.body.innerHTML=''; vi.clearAllMocks();});
async function click(text:string) {const b=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes(text)); expect(b, text).toBeTruthy(); await act(async()=>b!.click());}
describe('StudyMap workflow', () => {
 it('renames the library only on explicit submission', async () => {
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(<StudyMap/>));
  const input=document.querySelector('input')!;
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'New forest');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  expect(m.rename).not.toHaveBeenCalled();
  await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(m.rename).toHaveBeenCalledWith({id:'forest',name:'New forest'});
  expect(document.body.textContent).toContain('บันทึกชื่อแล้ว');
 });
 it('shows failed saves without reporting success', async () => {
  m.save.mockRejectedValueOnce(new Error('denied'));
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(<StudyMap/>));
  await click('รายวิชา');
  const select=document.querySelector('select')!;
  await act(async()=>{select.value='d';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await click('Math'); await click('ม.1'); await click('บันทึกแผนที่');
  expect(document.body.textContent).toContain('บันทึกแผนที่ไม่สำเร็จ');
  expect(document.body.textContent).not.toContain('บันทึกแผนที่แล้ว');
 });
 it('previews before explicitly saving a subject + grade assignment and opens linked files', async () => {
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(<StudyMap/>));
  await click('รายวิชา');
  const select=document.querySelector('select')!;
  await act(async()=>{select.value='d';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await click('Math'); await click('ม.1');
  expect(m.save).not.toHaveBeenCalled();
  await click('บันทึกแผนที่');
  expect(m.save).toHaveBeenCalledWith({plan_subject_id:'s',grade_level_id:'g',map_id:'forest'});
  await click('Algebra');
  expect(document.body.textContent).toContain('Equations');
  await click('Lesson PDF');
  expect(m.open).toHaveBeenCalledWith('real/path');
 });
 it('toggles full screen without remounting the map, keeps the lesson panel inside it, and exits with Escape', async () => {
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(<StudyMap/>));
  const frame=()=>document.querySelector('button[aria-pressed]')!.closest('div.relative')!.parentElement!;
  const toggle=()=>[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('เต็มจอ'))!;
  expect(toggle().textContent).toContain('เต็มจอ');
  expect(frame().className).not.toContain('fixed');
  const sceneBefore=document.querySelector('div');
  await act(async()=>toggle().click());
  expect(frame().className).toContain('fixed');
  expect(frame().className).toContain('inset-0');
  expect(toggle().textContent).toContain('ออกจากเต็มจอ');
  expect(document.body.style.overflow).toBe('hidden');
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));});
  expect(frame().className).not.toContain('fixed');
  expect(document.body.style.overflow).not.toBe('hidden');
  expect(document.querySelector('div')).toBe(sceneBefore);
 });
});
