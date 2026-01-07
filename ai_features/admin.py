from django.contrib import admin
from .models import UserPreference, FoodRecommendation, ChatSession, ChatMessage, AIModel, FoodView

@admin.register(UserPreference)
class UserPreferenceAdmin(admin.ModelAdmin):
    list_display = ('user', 'budget_range', 'last_updated')
    list_filter = ('budget_range', 'last_updated')
    search_fields = ('user__username', 'user__email')
    readonly_fields = ('last_updated',)

@admin.register(FoodRecommendation)
class FoodRecommendationAdmin(admin.ModelAdmin):
    list_display = ('user', 'food', 'score', 'recommendation_type', 'is_clicked', 'created_at')
    list_filter = ('recommendation_type', 'is_clicked', 'created_at')
    search_fields = ('user__username', 'food__name')

@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ('session_id', 'user', 'title', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('user__username', 'session_id', 'title')

@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('session', 'message_type', 'content_preview', 'created_at')
    list_filter = ('message_type', 'created_at')
    search_fields = ('session__session_id', 'content')
    
    def content_preview(self, obj):
        return obj.content[:50] + "..." if len(obj.content) > 50 else obj.content
    content_preview.short_description = 'Content Preview'

@admin.register(FoodView)
class FoodViewAdmin(admin.ModelAdmin):
    list_display = ('user_preference', 'food', 'view_count', 'last_viewed')
    list_filter = ('last_viewed',)
    search_fields = ('user_preference__user__username', 'food__name')

@admin.register(AIModel)
class AIModelAdmin(admin.ModelAdmin):
    list_display = ('name', 'model_type', 'version', 'is_active', 'created_at')
    list_filter = ('model_type', 'is_active', 'created_at')
    search_fields = ('name', 'version')
