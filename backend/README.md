# Contract Tracker — backend update

ชุดนี้ต่อยอดจาก server.js ที่รีวิวก่อนหน้า และรวม schema / alerts จากไฟล์ที่ส่งล่าสุด
นำไฟล์ในโฟลเดอร์นี้ไปแทนหรือเพิ่มใน backend เดิม โดยใช้ชื่อ `server.js`
เก็บ `notifyLine.js`, `notifyEmail.js`, `.env` และข้อมูล CSV เดิมไว้ ไม่รวมรหัสผ่านหรือข้อมูลจริงในชุดนี้

## สิ่งที่เพิ่ม

- Login ด้วย username/password; เก็บรหัสผ่านแบบ salted scrypt และเก็บ session token เป็น SHA-256 ในฐานข้อมูล
- HttpOnly session cookie อายุ 8 ชั่วโมง, logout/revoke เมื่อเปลี่ยนรหัสผ่าน, จำกัดการลอง login ผ่านตัวนับใน DB
- Admin: อ่าน/เพิ่ม/แก้ไข/ลบ, ยืนยัน baseline, อ่าน audit, สั่งส่งแจ้งเตือน
- Editor: อ่าน/เพิ่ม/แก้ไข แต่ลบและใช้งาน Admin endpoints ไม่ได้
- Viewer: อ่านและทำเครื่องหมายแจ้งเตือนของตนเองว่าอ่านแล้ว
- ทุก API ยกเว้น login และ health ต้องเข้าสู่ระบบ บัญชีผู้ใช้ไม่มีค่าเริ่มต้น
- Transaction ครอบการเขียนสัญญา การคำนวณ Master และ audit
- Master ใช้วันสิ้นสุด/สถานะของสัญญาย่อยที่เพิ่มล่าสุด (`created_at`, แล้ว `id`) ไม่ใช่วันสิ้นสุดที่ไกลที่สุด
- ลบ/ย้ายสัญญาย่อยสุดท้ายแล้วคืน `original_end_date` และ `original_status`
- การแก้วันสิ้นสุด/สถานะของ Master ที่มีสัญญาย่อยให้แก้ที่สัญญาย่อยล่าสุดแทน API ตอบ 409 เมื่อแก้ค่าที่ขัดกัน
- Master ที่ไม่มีสัญญาย่อย: แก้วันสิ้นสุด/สถานะได้ และอัปเดต baseline ตามค่าที่แก้
- ไม่อนุญาตเปลี่ยนประเภทสัญญาหลังสร้าง เพื่อไม่ให้ baseline หรือความสัมพันธ์ถูกตีความใหม่โดยไม่ตั้งใจ
- เพิ่ม `renewal_cycle` เมื่อวันสิ้นสุดเปลี่ยน หรือเปลี่ยนสถานะจากปิดกลับมาเปิดติดตาม
- UNIQUE index ป้องกัน app notification ซ้ำต่อสัญญา/รอบ/threshold; รักษาประวัติรอบเก่าไว้
- สถานะ Renewed และ Expired/Not renewed หยุดแจ้งเตือน และจัด `alert_level` เป็น `ok` แต่ยังคืนจำนวนวันสำหรับแสดงประวัติ
- วันคงเหลืออิงวันปฏิทิน Asia/Bangkok ไม่ขึ้นกับ timezone ของเครื่อง
- สถานะอ่านแจ้งเตือนแยกตามผู้ใช้; ค่า `seen` เก่าเก็บไว้เป็นประวัติ แต่ไม่ใช้แทนสถานะของผู้ใช้ใหม่
- Database checks, Parent FK แบบ RESTRICT, trigger ตรวจ Parent เป็น Master, indexes และ audit แบบก่อน/หลังการเปลี่ยนแปลง
- เก็บ NUMERIC เป็น string เพื่อไม่เพิ่มการปัดเศษที่ backend (หน้า ContractsTable เดิมแปลงเพื่อแสดงผลอยู่แล้ว)
- ไม่ seed ข้อมูลจำลองและไม่ส่งแจ้งเตือนอัตโนมัติจนกว่าจะเปิดค่าใน .env

## ติดตั้ง (PowerShell, Node.js >= 22.9)

1. สำรองฐานข้อมูลก่อน migration แล้วทดสอบในสำเนาฐานข้อมูลก่อนนำขึ้นใช้งานจริง
2. วางไฟล์ทั้งหมดใน backend เดิม รวมโฟลเดอร์ migrations, scripts และ test
3. รักษา `.env` เดิมไว้ แล้วเติมค่าจาก `.env.example`; อย่าเขียนทับ credentials เดิม
4. รัน `npm ci` (ไม่ได้เพิ่ม dependency ใหม่)
5. ตั้งค่า PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE หรือ DATABASE_URL ให้ถูกต้อง
6. ตั้ง PUBLIC_ORIGIN เป็น origin ที่เปิดหน้า login และ CORS_ORIGINS เป็น origin หน้าเว็บที่เชื่อถือ เช่น `http://localhost:5173,http://localhost:4000`
7. สร้าง Admin โดยรับรหัสผ่านอย่างน้อย 12 ตัวอักษร:

```powershell
$securePassword = Read-Host 'Admin password' -AsSecureString
$env:USER_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
npm run user -- create admin admin
Remove-Item Env:USER_PASSWORD
npm run check:data
npm start
```

`user` และ `start` จะรัน migration ที่ยังไม่เคยรันภายใน transaction พร้อม lock; ไม่รันซ้ำเมื่อมี schema_migrations แล้ว
ห้ามแก้ไฟล์ migration ที่ใช้แล้วในระบบจริง ให้เพิ่ม migration เลขถัดไปแทน
`check:data` อาจ exit 1 เมื่อมีข้อมูลเดิมต้องแก้/ยืนยัน นี่คือผลตรวจ ไม่ได้หมายถึงการลบข้อมูล

เปิด `http://localhost:4000/login` เพื่อเข้าสู่ระบบ จากนั้นกลับไปรีเฟรชหน้าแอป
ใน production ต้องใช้ HTTPS และ `NODE_ENV=production` เพื่อให้ cookie มี Secure
ใช้ reverse proxy ให้ frontend, `/api` และ `/login` อยู่ origin เดียวกันจะใช้งาน cookie ได้ตรงไปตรงมา
ถ้าแยก origin (แต่ยังเป็น site เดียวกัน) ให้ fetch ของ frontend เพิ่ม `credentials: 'include'` ทุก request รวม logout
ตัวอย่าง:

```javascript
fetch('http://localhost:4000/api/contracts', { credentials: 'include' });
```

หาก frontend อยู่คนละ site จริง Cookie SameSite=Strict จะไม่ถูกส่ง: ใช้ reverse proxy origin เดียวกัน
เมื่อ API ตอบ 401 ให้กลับไปหน้า `/login`; backend ไม่เปลี่ยน JSON error เป็น HTML redirect
หน้าแอปเดิมอาจยังแสดงปุ่มแก้ไข/ลบแก่ Viewer แต่ backend ปฏิเสธด้วย 403 ควรซ่อนปุ่มตาม role จาก `/api/auth/me`

## จัดการบัญชี

- `npm run user -- create editor01 editor` (ตั้ง USER_PASSWORD ก่อน)
- `npm run user -- create viewer01 viewer` (ตั้ง USER_PASSWORD ก่อน)
- `npm run user -- password editor01` (ตั้ง USER_PASSWORD ใหม่ก่อน; ยกเลิก session เดิมทั้งหมด)
- `npm run user -- disable viewer01` (session เดิมใช้งานต่อไม่ได้)

บัญชีและบทบาทจัดการผ่าน CLI โดยผู้ดูแลเครื่อง ไม่เปิด registration สาธารณะ
ตั้งค่า reverse proxy / Express trust proxy ตามโครงสร้างจริงก่อนใช้งานหลายผู้ใช้หลัง proxy;
ค่าเริ่มต้นไม่เชื่อ X-Forwarded-For เพื่อป้องกันการปลอม IP ตัวจำกัด login
หากมี proxy แต่ไม่ได้ตั้ง trust proxy ที่เหมาะสม ตัวจำกัดตาม IP จะนับรวมผู้ใช้หลัง proxy

## ข้อมูลเดิมที่ต้องยืนยัน

สถานะต้นฉบับของ Master ที่เคยถูกเขียนทับไม่สามารถกู้ได้จากข้อมูลปัจจุบัน
Migration เก็บค่าปัจจุบันชั่วคราวและตั้ง `baseline_needs_review=true` ให้ Master ที่มีลูก
การลบ/ย้ายลูกตัวสุดท้ายถูก rollback ด้วย 409 จน Admin ยืนยัน baseline; ไม่คืนค่าที่คาดเดาอัตโนมัติ
รายการดังกล่าวแสดงใน `npm run check:data` และ GET /api/contracts

Admin ใช้ `PUT /api/contracts/:id/baseline` พร้อม session cookie และ Origin ที่เชื่อถือ:

```json
{
  "original_end_date": "2026-10-30",
  "original_status": "Upcoming renewal"
}
```

ใช้ค่าจากสัญญาต้นฉบับจริง ไม่ใช้ค่าตัวอย่างนี้กับทุกสัญญา
API นี้แก้ baseline และบันทึก audit; ถ้ายังมีลูก Master จะยังใช้ค่าลูกล่าสุด
ข้อบังคับที่เป็น NOT VALID ตรวจการเขียนใหม่ทันที โดยไม่บังคับล้างข้อมูลเก่าทั้งตาราง
หลังแก้รายการผิดทั้งหมด DBA สามารถ VALIDATE CONSTRAINT ที่เพิ่มไว้ได้

## API ที่เพิ่ม/เปลี่ยน

| Endpoint | สิทธิ์ / พฤติกรรม |
| --- | --- |
| POST /api/auth/login | รับ username/password, ต้องมี Origin ที่เชื่อถือ |
| GET /api/auth/me | ผู้ใช้และ role ปัจจุบัน |
| POST /api/auth/logout | ลบ session ปัจจุบัน |
| GET /api/health | liveness สาธารณะ ไม่ทดสอบ DB |
| GET /api/audit?contract_id=123 | Admin, ประวัติล่าสุดสูงสุด 100 รายการ รวมก่อน/หลัง |
| PUT /api/contracts/:id/baseline | Admin ยืนยัน baseline |
| POST /api/notify/run-now | Admin session; ไม่ใช้ NOTIFY_RUN_KEY จากรุ่นก่อนแล้ว |
| GET/POST /api/notifications/... | รูปแบบ JSON เดิม แต่ seen แยกต่อผู้ใช้และแสดงเฉพาะรอบปัจจุบันที่ยังเปิดติดตาม |

Mutation requests ที่ใช้ cookie ต้องมี Origin ตรงกับค่าที่ตั้งไว้ด้วย เพื่อป้องกัน CSRF
Audit ไม่มี API แก้ไข/ลบ และไม่ cascade หายเมื่อสัญญาถูกลบ
Trigger ระบุชื่อ actor สำหรับการเขียนจาก API; direct SQL แสดงเป็น database/system
Audit ไม่ใช่หลักฐานที่แก้ไขไม่ได้สำหรับเจ้าของฐานข้อมูล: แยกสิทธิ์ DBA/runtime และสำรอง audit ตามนโยบายองค์กร

## การแจ้งเตือน

- เปิด `ENABLE_DAILY_ALERTS=true` หลังตั้งค่าและตรวจ notifyLine.js / notifyEmail.js เดิมแล้วเท่านั้น
- เวลาเริ่มต้น 08:00 Asia/Bangkok ปรับ timezone ได้ด้วย ALERT_TIMEZONE
- การ import และชุดทดสอบไม่เรียก start() ไม่ตั้ง cron และไม่ส่งข้อความจริง
- Database advisory lock ป้องกันงานส่งซ้อนระหว่าง process; ไม่รับประกัน exactly-once หาก provider ส่งแล้วแต่ connection ล้มก่อนบันทึก
- การสั่ง run-now หลายครั้งหลังแต่ละครั้งเสร็จเป็นการส่งใหม่โดยเจตนา; daily sender ยังไม่ใช้ outbox/delivery idempotency
- app notification มี UNIQUE index แยกตาม renewal_cycle จริง ไม่ได้พึ่งการเช็คก่อน insert เพียงอย่างเดียว
- notification เก่าก่อน migration เก็บ cycle=NULL ไว้เป็นประวัติ ระบบสร้างรอบปัจจุบันใหม่ครั้งแรก จึงอาจเห็นรายการปัจจุบันใหม่หลังอัปเกรด

## การทดสอบ

```powershell
npm test
# Integration ใช้ฐานข้อมูลทดสอบที่ว่าง/ทิ้งได้เท่านั้น
$env:TEST_DATABASE_URL = 'postgresql://user:password@localhost:5432/contract_tracker_test'
npm test
Remove-Item Env:TEST_DATABASE_URL
```

ไม่มี TEST_DATABASE_URL จะรัน unit tests และ skip integration
Integration สร้าง schema/users/contracts ทดสอบและคงข้อมูลไว้ในฐานทดสอบ ไม่ล้างฐานโดยอัตโนมัติ
ครอบคลุม login/session/logout, role/CSRF, cascade, rollback, ลบ/ย้ายลูกตัวสุดท้าย, baseline confirmation,
การเริ่มรอบใหม่, notification deduplication, seen แยกผู้ใช้, audit และ Parent constraint

ผลตรวจในสภาพแวดล้อมจัดทำ: unit tests ผ่าน; integration ผ่านบน PGlite (PostgreSQL engine แบบ embedded)
พร้อม adapter จำลอง pg Pool และ DATE parser และตรวจ syntax ผ่าน
ยังไม่ได้รันกับ PostgreSQL server ของคุณ, connection pool หลาย connection จริง หรือ LINE/Email จริง
ต้องทดสอบการแสดงผลกับ frontend ทั้งโปรเจกต์ เพราะไม่ได้รับไฟล์เริ่มต้นแอปและตัวเรียก API
