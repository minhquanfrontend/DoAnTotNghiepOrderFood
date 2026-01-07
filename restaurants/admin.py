from django.contrib import admin
from django.contrib.admin.sites import NotRegistered
from django.urls import reverse
from django.utils.html import format_html
from django.http import HttpResponseRedirect
from django.forms.models import BaseInlineFormSet
from .models import Category, Restaurant, Province, Banner, Food, SellerPost
from orders.models import Order, OrderItem


def safe_unregister(model):
    try:
        admin.site.unregister(model)
    except NotRegistered:
        pass


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('food', 'quantity', 'price', 'total_price')
    fields = ('food', 'quantity', 'price', 'total_price', 'notes')

    def total_price(self, obj):
        return obj.total_price
    total_price.short_description = 'Tổng tiền'


class RestaurantOrderInlineFormSet(BaseInlineFormSet):
    """Limit restaurant orders displayed inline to the latest 10 records."""

    def get_queryset(self):
        queryset = super().get_queryset().order_by('-created_at')
        return queryset[:10]


class RestaurantOrderInline(admin.TabularInline):
    model = Order
    extra = 0
    readonly_fields = ('order_number', 'customer', 'status', 'total_amount', 'created_at')
    fields = ('order_number', 'customer', 'status', 'total_amount', 'created_at')
    show_change_link = True
    can_delete = False
    formset = RestaurantOrderInlineFormSet


@admin.register(Province)
class ProvinceAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "center_latitude", "center_longitude", "default_radius_km")
    search_fields = ("name",)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'is_active', 'created_at', 'category_actions')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'description')
    actions = ['activate_categories', 'deactivate_categories']
    
    def category_actions(self, obj):
        actions_html = []
        try:
            edit_url = reverse('admin:restaurants_category_change', args=[obj.id])
            actions_html.append(
                f'<a href="{edit_url}" class="button" style="margin-right: 5px;">Sửa</a>'
            )
        except Exception:
            actions_html.append('<span style="color: red;">Lỗi URL</span>')
        return format_html(' '.join(actions_html))
    category_actions.short_description = 'Hành động'
    
    def activate_categories(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'Đã kích hoạt {updated} danh mục.')
    activate_categories.short_description = 'Kích hoạt danh mục đã chọn'
    
    def deactivate_categories(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'Đã vô hiệu hóa {updated} danh mục.')
    deactivate_categories.short_description = 'Vô hiệu hóa danh mục đã chọn'
    
    def response_add(self, request, obj, post_url_continue=None):
        if '_continue' not in request.POST and '_addanother' not in request.POST:
            return HttpResponseRedirect(reverse('admin:restaurants_category_changelist'))
        return super().response_add(request, obj, post_url_continue)
    
    def response_change(self, request, obj):
        if '_continue' not in request.POST:
            return HttpResponseRedirect(reverse('admin:restaurants_category_changelist'))
        return super().response_change(request, obj)


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'owner', 'province', 'is_active', 'is_open', 'rating', 'total_reviews', 'restaurant_actions')
    list_filter = ('province', 'is_active', 'is_open', 'created_at')
    search_fields = ('name', 'owner__username', 'address')
    readonly_fields = ('rating', 'total_reviews', 'created_at', 'updated_at')
    inlines = [RestaurantOrderInline]
    actions = ['activate_restaurants', 'deactivate_restaurants', 'mark_as_open', 'mark_as_closed']
    
    def restaurant_actions(self, obj):
        actions_html = []
        try:
            edit_url = reverse('admin:restaurants_restaurant_change', args=[obj.id])
            actions_html.append(
                f'<a href="{edit_url}" class="button" style="margin-right: 5px;">Sửa</a>'
            )
            foods_url = reverse('admin:restaurants_food_changelist') + f'?restaurant__id__exact={obj.id}'
            actions_html.append(
                f'<a href="{foods_url}" class="button" style="margin-right: 5px;">Món ăn</a>'
            )
            orders_url = reverse('admin:orders_order_changelist') + f'?restaurant__id__exact={obj.id}'
            actions_html.append(
                f'<a href="{orders_url}" class="button" style="margin-right: 5px;">Đơn hàng</a>'
            )
            if obj.owner:
                owner_url = reverse('admin:restaurants_restaurant_changelist') + f'?owner__id__exact={obj.owner.id}'
                actions_html.append(f'<a href="{owner_url}" class="button" style="margin-right: 5px;">Của {obj.owner.username}</a>')
        except Exception:
            actions_html.append('<span style="color: red;">Lỗi URL</span>')
        return format_html(' '.join(actions_html))
    restaurant_actions.short_description = 'Hành động'
    
    def activate_restaurants(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'Đã kích hoạt {updated} nhà hàng.')
    activate_restaurants.short_description = 'Kích hoạt nhà hàng đã chọn'
    
    def deactivate_restaurants(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'Đã vô hiệu hóa {updated} nhà hàng.')
    deactivate_restaurants.short_description = 'Vô hiệu hóa nhà hàng đã chọn'
    
    def mark_as_open(self, request, queryset):
        updated = queryset.update(is_open=True)
        self.message_user(request, f'Đã mở cửa {updated} nhà hàng.')
    mark_as_open.short_description = 'Đánh dấu mở cửa'
    
    def mark_as_closed(self, request, queryset):
        updated = queryset.update(is_open=False)
        self.message_user(request, f'Đã đóng cửa {updated} nhà hàng.')
    mark_as_closed.short_description = 'Đánh dấu đóng cửa'
    
    def response_add(self, request, obj, post_url_continue=None):
        if '_continue' not in request.POST and '_addanother' not in request.POST:
            return HttpResponseRedirect(reverse('admin:restaurants_restaurant_changelist'))
        return super().response_add(request, obj, post_url_continue)
    
    def response_change(self, request, obj):
        if '_continue' not in request.POST:
            return HttpResponseRedirect(reverse('admin:restaurants_restaurant_changelist'))
        return super().response_change(request, obj)


@admin.register(Food)
class FoodAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'restaurant', 'category', 'price', 'is_available', 'total_orders', 'food_actions')
    list_filter = ('is_available', 'is_featured', 'category', 'restaurant')
    search_fields = ('name', 'description', 'restaurant__name')
    readonly_fields = ('total_orders', 'rating', 'total_reviews')
    actions = ['activate_foods', 'deactivate_foods', 'mark_as_featured', 'mark_as_not_featured']
    
    def food_actions(self, obj):
        actions_html = []
        try:
            edit_url = reverse('admin:restaurants_food_change', args=[obj.id])
            actions_html.append(
                f'<a href="{edit_url}" class="button" style="margin-right: 5px;">Sửa</a>'
            )
        except Exception:
            actions_html.append('<span style="color: red;">Lỗi URL</span>')
        return format_html(' '.join(actions_html))
    food_actions.short_description = 'Hành động'
    
    def activate_foods(self, request, queryset):
        updated = queryset.update(is_available=True)
        self.message_user(request, f'Đã kích hoạt {updated} món ăn.')
    activate_foods.short_description = 'Kích hoạt món ăn đã chọn'
    
    def deactivate_foods(self, request, queryset):
        updated = queryset.update(is_available=False)
        self.message_user(request, f'Đã vô hiệu hóa {updated} món ăn.')
    deactivate_foods.short_description = 'Vô hiệu hóa món ăn đã chọn'
    
    def mark_as_featured(self, request, queryset):
        updated = queryset.update(is_featured=True)
        self.message_user(request, f'Đã đánh dấu {updated} món ăn là nổi bật.')
    mark_as_featured.short_description = 'Đánh dấu nổi bật'
    
    def mark_as_not_featured(self, request, queryset):
        updated = queryset.update(is_featured=False)
        self.message_user(request, f'Đã bỏ đánh dấu {updated} món ăn nổi bật.')
    mark_as_not_featured.short_description = 'Bỏ đánh dấu nổi bật'
    
    def response_add(self, request, obj, post_url_continue=None):
        if '_continue' not in request.POST and '_addanother' not in request.POST:
            return HttpResponseRedirect(reverse('admin:restaurants_food_changelist'))
        return super().response_add(request, obj, post_url_continue)
    
    def response_change(self, request, obj):
        if '_continue' not in request.POST:
            return HttpResponseRedirect(reverse('admin:restaurants_food_changelist'))
        return super().response_change(request, obj)