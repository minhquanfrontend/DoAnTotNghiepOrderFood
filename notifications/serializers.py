from rest_framework import serializers
from .models import Notification, PushToken, NotificationTemplate

class NotificationSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_notification_type_display', read_only=True)
    
    class Meta:
        model = Notification
        fields = '__all__'
        read_only_fields = ('user', 'is_sent', 'read_at')

class PushTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushToken
        fields = '__all__'
        read_only_fields = ('user', 'last_used')

class NotificationTemplateSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_notification_type_display', read_only=True)
    
    class Meta:
        model = NotificationTemplate
        fields = '__all__'
