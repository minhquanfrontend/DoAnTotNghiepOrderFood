from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, UserRequest


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'user_type', 'approval_status', 'is_active', 'date_joined')
    list_filter = ('user_type', 'approval_status', 'is_active', 'date_joined')
    search_fields = ('username', 'email', 'first_name', 'last_name', 'phone_number')

    fieldsets = UserAdmin.fieldsets + (
        ('Thông tin bổ sung', {
            'fields': ('user_type', 'phone_number', 'address', 'avatar', 'date_of_birth')
        }),
        ('Thông tin duyệt', {
            'fields': ('approval_status',)
        }),
        ('Thông tin shipper', {
            'fields': ('is_available', 'current_latitude', 'current_longitude')
        }),
    )


@admin.register(UserRequest)
class UserRequestAdmin(admin.ModelAdmin):
    list_display = ("user", "request_type", "status", "created_at")
    list_filter = ("request_type", "status", "created_at")
    search_fields = ("user__username", "user__email", "full_name", "phone")

    readonly_fields = (
        "user",
        "request_type",
        "full_name",
        "phone",
        "city",          # ✅ thay address -> city
        "id_number",
        "cccd_front",    # ✅ thay id_front -> cccd_front
        "cccd_back",     # ✅ thay id_back -> cccd_back
        "note",
        "ref_source",
        "created_at",
    )

    fieldsets = (
        ("Thông tin người dùng", {
            "fields": ("user", "full_name", "phone", "city", "id_number")
        }),
        ("Ảnh CCCD", {
            "fields": ("cccd_front", "cccd_back")
        }),
        ("Thông tin bổ sung", {
            "fields": ("request_type", "note", "ref_source")
        }),
        ("Duyệt yêu cầu", {
            "fields": ("status", "admin_note")
        }),
        ("Thời gian", {
            "fields": ("created_at", "updated_at")
        }),
    )
