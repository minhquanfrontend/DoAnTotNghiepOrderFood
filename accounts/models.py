from django.db import models
from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.utils.translation import gettext_lazy as _


# -------------------- Custom User Manager --------------------
class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, username, email=None, password=None, **extra_fields):
        if not username:
            raise ValueError("The Username must be set")
        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        return self.create_user(username, email, password, **extra_fields)


# -------------------- Custom User --------------------
class User(AbstractUser):
    USER_TYPES = (
        ("customer", "Khách hàng"),
        ("shipper", "Shipper"),
        ("restaurant", "Nhà hàng"),
        ("admin", "Quản trị"),
    )

    APPROVAL_STATUS = (
        ("pending", "Chờ duyệt"),
        ("approved", "Đã duyệt"),
        ("rejected", "Từ chối"),
    )

    email = models.EmailField(_("email address"), unique=True, null=True, blank=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)

    user_type = models.CharField(max_length=20, choices=USER_TYPES, default="customer")
    approval_status = models.CharField(max_length=20, choices=APPROVAL_STATUS, default="pending")

    # Vị trí shipper
    current_latitude = models.FloatField(null=True, blank=True)
    current_longitude = models.FloatField(null=True, blank=True)
    is_available = models.BooleanField(default=False)

    objects = UserManager()

    def __str__(self):
        return self.username


# -------------------- UserRequest --------------------
class UserRequest(models.Model):
    REQUEST_TYPES = [
        ("shipper_register", "Đăng ký Shipper"),
        ("restaurant_register", "Đăng ký Nhà hàng"),
    ]
    STATUS_CHOICES = [
        ("pending", "Chờ duyệt"),
        ("approved", "Đã duyệt"),
        ("rejected", "Từ chối"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_requests")
    request_type = models.CharField(max_length=50, choices=REQUEST_TYPES)
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=30)
    city = models.CharField(max_length=200, blank=True, null=True)
    id_number = models.CharField(max_length=50)  # CCCD/CMND bắt buộc
    ref_source = models.CharField(max_length=200, blank=True, null=True)
    note = models.TextField(blank=True, null=True)

    # 2 files: front/back CCCD
    cccd_front = models.ImageField(upload_to="user_requests/cccd_front/", null=True, blank=True)
    cccd_back = models.ImageField(upload_to="user_requests/cccd_back/", null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    admin_note = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username} - {self.get_request_type_display()} ({self.status})"