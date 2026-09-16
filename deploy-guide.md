# คู่มือ Deploy Contract Renewal Tracker ผ่าน Cloudflare Tunnel

สรุปขั้นตอนการเปิดแอป Contract Renewal Tracker (frontend + backend + postgres) ออก public โดยไม่มีโดเมนของตัวเอง โดยใช้ Cloudflare Quick Tunnel ผ่าน Docker Compose

---

## 1. โครงสร้างระบบ

แอปประกอบด้วย 3 ส่วนหลักที่รันเป็น container แยกกัน:

| Service | หน้าที่ | Port ข้างใน container |
|---|---|---|
| `postgres` | ฐานข้อมูล | 5432 |
| `backend` | Express API | 4000 |
| `frontend` | เว็บ (build แล้ว serve ด้วย nginx) | 80 |

เปิด public ออกไปด้วย Cloudflare Quick Tunnel **สองเส้นแยกกัน**:
- เส้นหนึ่งชี้ไปที่ `frontend:80`
- อีกเส้นชี้ไปที่ `backend:4000`

เหตุผลที่ต้องแยกสองเส้น: frontend เป็น static site ที่ต้องยิง fetch ไปหา backend ผ่าน URL จริง (ไม่ใช่ `localhost`) เพราะผู้ใช้ที่เข้าเว็บจากเครื่องอื่นไม่มีทางเข้าถึง `localhost` ของเครื่องที่รัน Docker ได้

---

## 2. docker-compose.yml (ฉบับเต็ม)

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --url http://frontend:80
    networks:
      - default

  cloudflared-api:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --url http://backend:4000

  postgres:
    image: postgres:16-alpine
    container_name: contract-tracker-postgres
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=contract_tracker
    volumes:
      - contract-tracker-pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  backend:
    build:
      context: ./backend
    container_name: contract-tracker-backend
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
      - PGHOST=postgres
      - PGPORT=5432
      - PGUSER=postgres
      - PGPASSWORD=postgres
      - PGDATABASE=contract_tracker
      - CORS_ORIGIN=  # ใส่ URL frontend หลังได้ tunnel แล้ว (ดูข้อ 4)
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_BASE: # ใส่ URL backend tunnel ตรงนี้ (ดูข้อ 3)
    container_name: contract-tracker-frontend
    ports:
      - "5173:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  contract-tracker-pgdata:
```

---

## 3. ขั้นตอน Deploy

1. **รัน tunnel ครั้งแรก** (ยังไม่ต้องมี URL ของอีกฝั่ง):
   ```
   docker compose up -d
   ```

2. **ดู URL ของ backend tunnel:**
   ```
   docker compose logs -f cloudflared-api
   ```
   จะได้ URL แบบ `https://atlantic-buttons-logistics-released.trycloudflare.com`

3. **ใส่ URL backend เข้าไปที่ `VITE_API_BASE`** ใน service `frontend` แล้ว build ใหม่:
   ```
   docker compose up -d --build frontend
   ```
   > สำคัญ: Vite ฝังค่า env เข้า JS bundle ตอน build เท่านั้น แก้แล้วต้อง build ใหม่เสมอ แก้ env เฉยๆ ไม่มีผล

4. **ดู URL ของ frontend tunnel:**
   ```
   docker compose logs -f cloudflared
   ```

5. **ใส่ URL frontend เข้าไปที่ `CORS_ORIGIN`** ใน service `backend` แล้ว restart (ไม่ต้อง build ใหม่ เพราะเป็นแค่ env var):
   ```
   docker compose up -d backend
   ```

6. เปิด URL frontend จากเครื่องอื่น/มือถือ ทดสอบว่าโหลดข้อมูลได้

---

## 4. ปัญหาที่เจอระหว่างทำ และวิธีแก้

### Error 502 (Bad Gateway)
สาเหตุ: cloudflared ชี้ port ผิด — ใช้ port ที่ map ออกมาข้างนอก (เช่น `5173`) แทนที่จะใช้ port ที่แอปฟังจริงข้างใน container (เช่น `80` สำหรับ nginx)

วิธีเช็ค: ดูจาก `ports:` ใน compose — เลขหลัง `:` คือ port ข้างในที่ต้องใช้ ไม่ใช่เลขหน้า

### Popup "ต้องการที่จะเข้าถึงแอปและบริการอื่นๆ ในอุปกรณ์นี้" (Chrome Local Network Access)
ไม่ใช่ CORS error — เป็น popup ของ Chrome ที่บล็อกเว็บสาธารณะไม่ให้ fetch เข้าไปหา `localhost`/LAN ของเครื่องผู้ใช้ สาเหตุคือ `VITE_API_BASE` ยัง build ด้วยค่า `localhost:4000` อยู่

วิธีแก้: เปลี่ยน `VITE_API_BASE` เป็น URL public ของ backend tunnel แล้ว build frontend ใหม่ (ดูข้อ 3)

### "Cannot GET /"
ไม่ใช่ปัญหา — เกิดจากเปิด backend URL ตรงๆ ในเบราว์เซอร์ ซึ่งไม่มี route `GET /` ให้ตอบ ตัว API จริงอยู่ที่ path อื่น (เช่น `/api/contracts`) ให้เช็คที่ frontend URL แทน

### CORS
ถ้า backend ใช้ `app.use(cors())` เฉยๆ (ไม่ใส่ options) จะอนุญาตทุก origin อยู่แล้ว ปกติไม่ติด เว้นแต่ frontend ยิง fetch แบบ `credentials: 'include'` ซึ่งต้องระบุ origin ตรงๆ แทนการใช้ `*`:
```js
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));
```

---

## 5. ข้อจำกัดของ Quick Tunnel

- URL แบบ `*.trycloudflare.com` **เปลี่ยนใหม่ทุกครั้งที่ restart container** — ต้อง build frontend ใหม่และอัปเดต `CORS_ORIGIN` ทุกครั้งที่ restart
- เหมาะกับทดสอบ/เดโม ไม่เหมาะใช้งานจริงระยะยาว
- ถ้าต้องการ URL คงที่ ต้องมีโดเมนของตัวเองแล้วสร้าง Named Tunnel ผ่าน token แทน Quick Tunnel
