import os
from pathlib import Path
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY', default='django-insecure-your-secret-key-here')
AUTH_USER_MODEL = 'accounts.User'

DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'jazzmin',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.humanize',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'accounts',
    'restaurants',
    'orders',
    'payments',
    'ai_features',
    'home',
    'admin_dashboard',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    

]

ROOT_URLCONF = 'food_delivery.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'food_delivery.wsgi.application'
ASGI_APPLICATION = 'food_delivery.asgi.application'

# Database MySQL
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'data',
        'USER': 'root',
        'PASSWORD': '123456789',
        'HOST': 'localhost',
        'PORT': '3306',
        'OPTIONS': {
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
            'charset': 'utf8mb4',
        },
        'TEST': {
            'CHARSET': 'utf8mb4',
            'COLLATION': 'utf8mb4_unicode_ci',
        }
    }
}

# REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}
# JWT Settings
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
}
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.1.80:3000",
    "http://192.168.1.80:19006",  # Thêm dòng này
    "http://192.168.1.80:19000",  # Thêm dòng này
]
# CORS Settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:19006",  # Expo default port
    "http://192.168.1.80:19006",  # Thêm dòng này
    "http://192.168.1.80:19000",  # Thêm dòng này
]
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]
CORS_ALLOW_ALL_ORIGINS = True

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Internationalization
LANGUAGE_CODE = 'vi'
TIME_ZONE = 'Asia/Ho_Chi_Minh'
USE_I18N = True
USE_TZ = True

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# OpenAI API Key
OPENAI_API_KEY = config('OPENAI_API_KEY', default='')

# Stripe Settings
STRIPE_PUBLISHABLE_KEY = config('STRIPE_PUBLISHABLE_KEY', default='')
STRIPE_SECRET_KEY = config('STRIPE_SECRET_KEY', default='')

# Channel Layers
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('127.0.0.1', 6379)],
        },
    },
}

# Celery Configuration
CELERY_BROKER_URL = 'redis://localhost:6379'
CELERY_RESULT_BACKEND = 'redis://localhost:6379'

# Jazzmin Settings
JAZZMIN_SETTINGS = {
    # Title on the brand (19 chars max)
    "site_title": "Food Delivery Admin",
    # Title on the login screen
    "site_header": "Food Delivery",
    # Welcome text on the login screen
    "welcome_sign": "Welcome to Food Delivery Admin",
    # Copyright on the footer
    "copyright": "Food Delivery Ltd",
    # Theme
    "theme": "darkly",  # You can try other themes like 'slate', 'solar', 'superhero', etc.
    # Custom icons
    "icons": {
        "auth.user": "fas fa-user",
        "auth.Group": "fas fa-users",
    },
    # Sidebar menu customization
    "show_sidebar": True,
    "navigation_expanded": True,
    # Custom links in the top menu
    "topmenu_links": [
        {"name": "Home", "url": "admin:index", "permissions": ["auth.view_user"]},
    ],
    # Custom dashboard callback for statistics
    "index_title": "Dashboard - Tổng quan hệ thống",
    "custom_dashboard_callback": "food_delivery.dashboard_callback.dashboard_callback",
    # Custom CSS/JS
    "custom_css": "css/admin_dashboard.css",
    "custom_js": "js/admin_dashboard.js",
    "icons": {
    # Auth
    "auth.user": "fas fa-user-shield",
    "auth.Group": "fas fa-users-cog",
    
    # Accounts
    "accounts.User": "fas fa-user-tie",
    "accounts.Profile": "fas fa-id-card",
    
    # Restaurants
    "restaurants.Restaurant": "fas fa-store-alt",
    "restaurants.Category": "fas fa-tags",
    "restaurants.Menu": "fas fa-utensils",
    "restaurants.FoodItem": "fas fa-hamburger",
    "restaurants.Review": "fas fa-star",
    
    # Orders
    "orders.Order": "fas fa-shopping-bag",
    "orders.OrderItem": "fas fa-box",
    "orders.Cart": "fas fa-shopping-cart",
    
    # Payments
    "payments.Payment": "fas fa-credit-card",
    "payments.Transaction": "fas fa-exchange-alt",
    "payments.Coupon": "fas fa-ticket-alt",
    
    # AI Features
    "ai_features.Preference": "fas fa-robot",
    "ai_features.Recommendation": "fas fa-magic",
    
    # Notifications
    "notifications.Notification": "fas fa-bell",
    "notifications.PushToken": "fas fa-mobile-alt",
    
    # Wallet
    "wallet.Wallet": "fas fa-wallet",
    "wallet.Transaction": "fas fa-money-bill-wave",
    
    # Default icons
    "sites.Site": "fas fa-globe-americas",
    "admin.LogEntry": "fas fa-file-alt",
    "contenttypes.ContentType": "fas fa-tag",
    "sessions.Session": "fas fa-hourglass-half",
    "token_blacklist": "fas fa-ban",
    "token_blacklist.OutstandingToken": "fas fa-key",
    "token_blacklist.BlacklistedToken": "fas fa-key",
}
}

# Jazzmin UI Tweaks
JAZZMIN_UI_TWEAKS = {
    "navbar_small_text": False,
    "footer_small_text": False,
    "body_small_text": False,
    "brand_small_text": False,
    "brand_colour": "navbar-primary",
    "accent": "accent-primary",
    "navbar": "navbar-dark",
    "no_navbar_border": False,
    "sidebar": "sidebar-dark-primary",
    "sidebar_nav_small_text": False,
    "sidebar_disable_expand": False,
    "sidebar_nav_child_indent": False,
    "sidebar_nav_compact_style": False,
    "sidebar_nav_legacy_style": False,
    "sidebar_nav_flat_style": False,
    "theme": "darkly",
    "dark_mode_theme": "darkly",
}

# ===================
# PAYMENT GATEWAYS
# ===================

# VNPay Configuration
VNPAY_ENABLED = config('VNPAY_ENABLED', default=False, cast=bool)
VNPAY_TMN_CODE = config('VNPAY_TMN_CODE', default='')
VNPAY_HASH_SECRET = config('VNPAY_HASH_SECRET', default='')
VNPAY_PAYMENT_URL = config(
    'VNPAY_PAYMENT_URL', 
    default='https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
)
VNPAY_RETURN_URL = config(
    'VNPAY_RETURN_URL', 
    default='http://localhost:8000/api/payments/return/'
)

# MoMo Configuration
MOMO_ENABLED = config('MOMO_ENABLED', default=False, cast=bool)
MOMO_PARTNER_CODE = config('MOMO_PARTNER_CODE', default='')
MOMO_ACCESS_KEY = config('MOMO_ACCESS_KEY', default='')
MOMO_SECRET_KEY = config('MOMO_SECRET_KEY', default='')
MOMO_ENDPOINT = config(
    'MOMO_ENDPOINT',
    default='https://test-payment.momo.vn/v2/gateway/api/create'
)
MOMO_RETURN_URL = config(
    'MOMO_RETURN_URL',
    default='http://localhost:8000/api/payments/return/'
)
MOMO_NOTIFY_URL = config(
    'MOMO_NOTIFY_URL',
    default='http://localhost:8000/api/payments/webhook/momo/'
)

# Frontend URL for redirects
FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:3000')

# email
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'quanlibomedia@gmail.com'
EMAIL_HOST_PASSWORD = 'pakfsaoynjnqecxu'
DEFAULT_FROM_EMAIL = 'Food Delivery <quanlibomedia@gmail.com>'

# Payment Gateway Keys
MOMO_PARTNER_CODE = 'your_code'
MOMO_ACCESS_KEY = 'your_key'
MOMO_SECRET_KEY = 'your_secret'

VNPAY_TMN_CODE = "CTN361U1"
VNPAY_HASH_SECRET = "BOSNIANCUSMTW3IAGVXG9K7AYGVC9W1N"
VNPAY_PAYMENT_URL = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"

ZALOPAY_APP_ID = '2553'
ZALOPAY_KEY1 = 'your_key1'
ZALOPAY_KEY2 = 'your_key2'

# Bank Transfer
BANK_ID = '970422'
BANK_ACCOUNT_NO = '0123456789'
BANK_ACCOUNT_NAME = 'FOOD DELIVERY SYSTEM'

FRONTEND_URL = 'http://localhost:3000'