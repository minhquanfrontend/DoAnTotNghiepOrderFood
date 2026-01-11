from django.db import models
from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.utils.translation import gettext_lazy as _
import uuid


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

    is_email_verified = models.BooleanField(default=False)
    email_verification_token = models.UUIDField(default=uuid.uuid4, editable=False, null=True, blank=True)
    email_verification_expires = models.DateTimeField(null=True, blank=True)

    # Vị trí shipper
    current_latitude = models.FloatField(null=True, blank=True)
    current_longitude = models.FloatField(null=True, blank=True)
    is_available = models.BooleanField(default=False)

    objects = UserManager()

    def __str__(self):
        return self.username

    def is_verification_token_valid(self):
        from django.utils import timezone
        return (
            self.email_verification_token and
            self.email_verification_expires and
            self.email_verification_expires > timezone.now()
        )

    def generate_verification_token(self):
        from django.utils import timezone

        self.email_verification_token = uuid.uuid4()
        self.email_verification_expires = timezone.now() + timezone.timedelta(hours=24)
        self.save(update_fields=["email_verification_token", "email_verification_expires"])
        return self.email_verification_token

    def verify_email(self):
        self.is_email_verified = True
        self.email_verification_token = None
        self.email_verification_expires = None
        self.save(update_fields=["is_email_verified", "email_verification_token", "email_verification_expires"])


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