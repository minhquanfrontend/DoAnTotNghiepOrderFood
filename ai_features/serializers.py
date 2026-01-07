from rest_framework import serializers
from .models import UserPreference, FoodRecommendation, ChatSession, ChatMessage, AIModel
from restaurants.serializers import FoodSerializer


class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = '__all__'
        read_only_fields = ('user',)


class FoodRecommendationSerializer(serializers.ModelSerializer):
    food = FoodSerializer(read_only=True)

    class Meta:
        model = FoodRecommendation
        fields = '__all__'
        read_only_fields = ('user', 'score', 'reason', 'recommendation_type')


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = '__all__'
        read_only_fields = ('session', 'created_at')


class ChatSessionSerializer(serializers.ModelSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatSession
        fields = '__all__'
        read_only_fields = ('user', 'session_id')

    def get_message_count(self, obj):
        return obj.messages.count()


# 🔹 Serializer dùng cho API gửi tin nhắn chat
class SendMessageSerializer(serializers.Serializer):
    message = serializers.CharField()
    session_id = serializers.CharField(required=False, allow_blank=True)


class AIModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIModel
        fields = '__all__'
