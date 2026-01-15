# Food Delivery System

## 1) Yêu cầu hệ thống

### Backend (Django)
- Python 3.10+ (khuyến nghị)
- MySQL 8.x (hoặc MariaDB tương đương)
- (Khuyến nghị) Redis nếu người dùng dùng Celery/Channels

### Mobile app
- Node.js 18+ (khuyến nghị)
- Expo CLI (cài qua npm)
- Android Studio Emulator hoặc thiết bị thật

## 2) Clone project

```bash
git clone <repo_url>
cd food-delivery-system
```

Thư mục backend chính là thư mục hiện tại (có file `manage.py`). Mobile app nằm trong `mobile-app/`.

## 3) Cấu hình & chạy Backend (Django)

### 3.1 Tạo môi trường ảo và cài dependencies

Windows (PowerShell):

```bash
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3.2 Tạo database MySQL

Tạo database (ví dụ tên `data`):

```sql
CREATE DATABASE data CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3.3 Thay đổi cấu hình MySQL

Hiện tại dự án **đang hard-code cấu hình MySQL** trong:

- `food_delivery/settings.py` → biến `DATABASES`

Người dùng cần sửa các trường sau cho đúng máy:
- `NAME`: tên database (mặc định đang là `data`)
- `USER`: user MySQL (mặc định `root`)
- `PASSWORD`: mật khẩu MySQL
- `HOST`: mặc định `localhost`
- `PORT`: mặc định `3306`

Ví dụ (tham khảo, hãy chỉnh theo máy):

```py
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'data',
        'USER': 'root',
        'PASSWORD': 'your_password',
        'HOST': 'localhost',
        'PORT': '3306',
        'OPTIONS': {
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
            'charset': 'utf8mb4',
        },
    }
}
```

Lưu ý:
- Dự án đã có `mysqlclient` trong `requirements.txt`.
- File `.env` hiện **chỉ** chứa `SECRET_KEY`, `DEBUG`, `OPENAI_API_KEY`, `STRIPE_*`… (chưa có DB vars).

### 3.4 Chạy migrate + tạo admin

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
```

### 3.5 Chạy server

```bash
python manage.py runserver
```

Mặc định API sẽ chạy tại:
- `http://127.0.0.1:8000/`
- API prefix: `http://127.0.0.1:8000/api/`

## 4) Cấu hình & chạy Mobile App (Expo)

### 4.1 Cài dependencies

```bash
cd mobile-app
npm install
```

### 4.2 Chạy Expo

```bash
npx run start
```

### 4.3 Cấu hình Base URL API cho app

Mobile app gọi backend qua `baseURL` trong:
- `mobile-app/src/api/axiosInstance.js`
- `mobile-app/src/services/api.js`

Mặc định đã tối ưu cho Android Emulator:
- Android emulator: `http://10.0.2.2:8000/api/`
- iOS simulator / web: `http://127.0.0.1:8000/api/`

Nếu người dùng chạy app trên **thiết bị thật**, cần đổi host sang IP LAN của máy chạy backend, ví dụ:
- `http://192.168.1.80:8000/api/`

Có thể sửa trực tiếp hằng `EMULATOR_HOST` (trong `axiosInstance.js`) hoặc thay `BASE_URL` (trong `api.js`).

## 5) Ghi chú thêm (tùy chọn)

### Redis / Celery / Channels
Trong `food_delivery/settings.py` có cấu hình:
- `CHANNEL_LAYERS` dùng Redis (`127.0.0.1:6379`)
- `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` dùng Redis

Nếu không dùng các tính năng realtime/background job thì có thể chưa cần chạy Redis ngay. Nếu gặp lỗi liên quan Redis/Channels/Celery khi chạy tính năng nâng cao, hãy cài và chạy Redis local.

## 6) Troubleshooting

- Lỗi kết nối MySQL (`Access denied`, `Unknown database`):
  - Kiểm tra lại `USER`/`PASSWORD`/`NAME` trong `food_delivery/settings.py`
  - Đảm bảo MySQL đang chạy và port đúng

- Mobile app không gọi được API:
  - Android emulator phải dùng `10.0.2.2` để trỏ về máy host
  - Thiết bị thật phải dùng IP LAN của máy chạy backend (cùng mạng Wi-Fi)
  - Đảm bảo firewall không chặn port `8000`
