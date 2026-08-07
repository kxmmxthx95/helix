# Helix

ระบบจัดการสถานศึกษา — React + Supabase + Vercel, ติดตั้งเป็น PWA ได้

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env.local   # ใส่ค่าจาก Supabase project
npm run dev
```

รัน migration ใน Supabase SQL editor: [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)

จากนั้นสร้างแผนกและผู้ดูแลระบบคนแรก:

```sql
insert into departments (code, name) values ('A', 'แผนก A'), ('B', 'แผนก B'), ('C', 'แผนก C');

-- สร้าง user ใน Authentication > Users ก่อน แล้วเอา uid มาใส่
insert into profiles (id, role, full_name, email)
values ('<auth-uid>', 'super_admin', 'ผู้ดูแลระบบ', 'admin@example.com');
```

## คำสั่ง

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | เซิร์ฟเวอร์ dev |
| `npm run build` | build production + service worker |
| `npm test` | รันเทสต์ |
| `node scripts/make-icons.mjs` | สร้างไอคอน PWA ชั่วคราว |

## สิทธิ์การเข้าถึง

บังคับที่ชั้นฐานข้อมูลด้วย RLS — `src/lib/roles.ts` เป็นแค่สำเนาไว้ซ่อน UI ไม่ใช่ขอบเขตความปลอดภัย

| Role | เห็นอะไร |
| --- | --- |
| `super_admin`, `director` | ทุกแผนก |
| `dept_head`, `academic_head` | แผนกตัวเอง + แก้ไขได้ |
| `teacher`, `staff` | แผนกตัวเอง อ่านอย่างเดียว |
| `student` | ข้อมูลตัวเอง |
| `parent` | ข้อมูลบุตรหลาน |

การแก้ไขของ role ที่ไม่ใช่ `student`/`parent` จะถูกบันทึกลง `audit_logs` โดยอัตโนมัติ

## ออฟไลน์

- อ่าน: service worker แคชแบบ cache-as-you-go (`vite.config.ts`)
- เขียน: คิวใน IndexedDB (`src/lib/outbox.ts`) แล้วส่งตามลำดับเวลาเมื่อกลับมาออนไลน์

## ที่ต้องทำต่อ

- แทน `public/pwa-*.png` ด้วยโลโก้จริง
- ตั้งค่า LINE LIFF (บัญชีต้องถูกสร้างโดย admin ก่อน)
