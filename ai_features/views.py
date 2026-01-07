from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count, Avg
from django.conf import settings
import openai
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.decomposition import TruncatedSVD
import uuid
import json

from .models import UserPreference, FoodRecommendation, ChatSession, ChatMessage, AIModel, FoodView
from .serializers import (
    UserPreferenceSerializer, FoodRecommendationSerializer, 
    ChatSessionSerializer, ChatMessageSerializer, SendMessageSerializer
)
from restaurants.models import Food, Restaurant
from orders.models import Order, OrderItem
from django.utils import timezone
from .chatbot_service import FoodOrderingChatbot

# Set OpenAI API key
openai.api_key = settings.OPENAI_API_KEY

class UserPreferenceView(generics.RetrieveUpdateAPIView):
    serializer_class = UserPreferenceSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_object(self):
        preference, created = UserPreference.objects.get_or_create(user=self.request.user)
        return preference

class RecommendationListView(generics.ListAPIView):
    serializer_class = FoodRecommendationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        # Generate recommendations if not exist or outdated
        self.generate_recommendations_for_user(self.request.user)
        return FoodRecommendation.objects.filter(user=self.request.user)[:20]
    
    def generate_recommendations_for_user(self, user):
        """Generate recommendations using hybrid approach"""
        try:
            # Clear old recommendations
            FoodRecommendation.objects.filter(user=user).delete()
            
            # Get user preferences
            user_preference, _ = UserPreference.objects.get_or_create(user=user)
            
            # Generate different types of recommendations
            collaborative_recs = self.collaborative_filtering(user)
            content_based_recs = self.content_based_filtering(user)
            trending_recs = self.trending_recommendations()
            
            # Combine and save recommendations
            all_recommendations = []
            all_recommendations.extend(collaborative_recs)
            all_recommendations.extend(content_based_recs)
            all_recommendations.extend(trending_recs)
            
            # Remove duplicates and sort by score
            seen_foods = set()
            unique_recs = []
            for rec in sorted(all_recommendations, key=lambda x: x['score'], reverse=True):
                if rec['food_id'] not in seen_foods:
                    seen_foods.add(rec['food_id'])
                    unique_recs.append(rec)
                    if len(unique_recs) >= 20:
                        break
            
            # Save to database
            for rec in unique_recs:
                FoodRecommendation.objects.create(
                    user=user,
                    food_id=rec['food_id'],
                    score=rec['score'],
                    reason=rec['reason'],
                    recommendation_type=rec['type']
                )
                
        except Exception as e:
            print(f"Error generating recommendations: {e}")
    
    def collaborative_filtering(self, user):
        """Collaborative filtering based on user orders"""
        recommendations = []
        
        try:
            # Get user's order history
            user_orders = OrderItem.objects.filter(order__customer=user).values_list('food_id', flat=True)
            
            if not user_orders:
                return recommendations
            
            # Find similar users based on order history
            similar_users = []
            for other_user_id in OrderItem.objects.exclude(order__customer=user).values_list('order__customer_id', flat=True).distinct():
                other_user_orders = set(OrderItem.objects.filter(order__customer_id=other_user_id).values_list('food_id', flat=True))
                user_order_set = set(user_orders)
                
                # Calculate Jaccard similarity
                intersection = len(user_order_set.intersection(other_user_orders))
                union = len(user_order_set.union(other_user_orders))
                
                if union > 0:
                    similarity = intersection / union
                    if similarity > 0.1:  # Threshold for similarity
                        similar_users.append((other_user_id, similarity))
            
            # Get recommendations from similar users
            similar_users.sort(key=lambda x: x[1], reverse=True)
            for similar_user_id, similarity in similar_users[:5]:
                similar_user_foods = OrderItem.objects.filter(
                    order__customer_id=similar_user_id
                ).exclude(
                    food_id__in=user_orders
                ).values('food_id').annotate(
                    order_count=Count('id')
                ).order_by('-order_count')
                
                for item in similar_user_foods[:3]:
                    food = Food.objects.get(id=item['food_id'])
                    recommendations.append({
                        'food_id': food.id,
                        'score': similarity * 0.8,
                        'reason': f'Người dùng có sở thích tương tự đã đặt món này {item["order_count"]} lần',
                        'type': 'collaborative'
                    })
                    
        except Exception as e:
            print(f"Collaborative filtering error: {e}")
        
        return recommendations
    
    def content_based_filtering(self, user):
        """Content-based filtering based on food features"""
        recommendations = []
        
        try:
            # Get user's food preferences from order history
            user_foods = OrderItem.objects.filter(order__customer=user).values_list('food', flat=True)
            
            if not user_foods:
                return recommendations
            
            # Get food features (name, description, ingredients, category)
            all_foods = Food.objects.filter(is_available=True)
            food_features = []
            food_ids = []
            
            for food in all_foods:
                features = f"{food.name} {food.description} {food.ingredients} {food.category.name if food.category else ''}"
                food_features.append(features)
                food_ids.append(food.id)
            
            # Create TF-IDF vectors
            vectorizer = TfidfVectorizer(max_features=1000, stop_words=None)
            tfidf_matrix = vectorizer.fit_transform(food_features)
            
            # Get user profile (average of liked foods)
            user_food_indices = [food_ids.index(food_id) for food_id in user_foods if food_id in food_ids]
            
            if user_food_indices:
                user_profile = np.mean(tfidf_matrix[user_food_indices].toarray(), axis=0)
                
                # Calculate similarity with all foods
                similarities = cosine_similarity([user_profile], tfidf_matrix.toarray())[0]
                
                # Get top recommendations
                food_similarities = list(zip(food_ids, similarities))
                food_similarities.sort(key=lambda x: x[1], reverse=True)
                
                for food_id, similarity in food_similarities[:10]:
                    if food_id not in user_foods and similarity > 0.1:
                        food = Food.objects.get(id=food_id)
                        recommendations.append({
                            'food_id': food_id,
                            'score': similarity * 0.7,
                            'reason': f'Dựa trên sở thích của bạn về {food.category.name if food.category else "món ăn tương tự"}',
                            'type': 'content_based'
                        })
                        
        except Exception as e:
            print(f"Content-based filtering error: {e}")
        
        return recommendations
    
    def trending_recommendations(self):
        """Get trending foods based on recent orders"""
        recommendations = []
        
        try:
            from datetime import timedelta

            # Get foods ordered in last 7 days (timezone-aware)
            last_week = timezone.now() - timedelta(days=7)
            trending_foods = OrderItem.objects.filter(
                order__created_at__gte=last_week
            ).values('food').annotate(
                order_count=Count('id'),
                avg_rating=Avg('food__rating')
            ).filter(
                order_count__gte=5,  # At least 5 orders
                avg_rating__gte=4.0  # Good rating
            ).order_by('-order_count')[:5]
            
            for item in trending_foods:
                food = Food.objects.get(id=item['food'])
                recommendations.append({
                    'food_id': food.id,
                    'score': min(item['order_count'] / 10.0, 1.0),  # Normalize score
                    'reason': f'Món ăn hot với {item["order_count"]} đơn hàng tuần này',
                    'type': 'trending'
                })
                
        except Exception as e:
            print(f"Trending recommendations error: {e}")
        
        return recommendations

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def track_food_view(request):
    """Track when user views a food item"""
    food_id = request.data.get('food_id')
    
    if not food_id:
        return Response({'error': 'food_id is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        food = Food.objects.get(id=food_id)
        user_preference, _ = UserPreference.objects.get_or_create(user=request.user)
        
        food_view, created = FoodView.objects.get_or_create(
            user_preference=user_preference,
            food=food,
            defaults={'view_count': 1}
        )
        
        if not created:
            food_view.view_count += 1
            food_view.save()
        
        return Response({'message': 'Tracked food view'})
        
    except Food.DoesNotExist:
        return Response({'error': 'Food not found'}, status=status.HTTP_404_NOT_FOUND)

# Chatbot Views
class ChatSessionListView(generics.ListCreateAPIView):
    serializer_class = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        # Return recent sessions including basic metadata
        return (ChatSession.objects
                .filter(user=self.request.user)
                .order_by('-created_at')
                .prefetch_related('messages')[:20])
    
    def create(self, request, *args, **kwargs):
        # Initialize a new chat session with the improved chatbot
        try:
            chatbot = FoodOrderingChatbot(user=request.user)
            session = chatbot.session
            
            # Get initial greeting
            greeting = chatbot._generate_greeting()
            username = request.user.get_full_name() or request.user.username
            
            # Save initial bot message
            ChatMessage.objects.create(
                session=session,
                message_type='bot',
                content=f"{greeting} {username}! Tôi có thể giúp gì cho bạn hôm nay?",
                metadata={
                    'suggestions': [
                        'Xem thực đơn',
                        'Gợi ý món ngon',
                        'Kiểm tra đơn hàng'
                    ]
                }
            )
            
            serializer = self.get_serializer(session)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class ChatSessionDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "session_id"
    
    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # Get chat messages for this session
        messages = ChatMessage.objects.filter(
            session=instance
        ).order_by('created_at')
        
        # Serialize the session
        serializer = self.get_serializer(instance)
        data = serializer.data
        
        # Add messages to the response
        from .serializers import ChatMessageSerializer
        data['messages'] = ChatMessageSerializer(messages, many=True).data
        
        # If no messages, add a welcome message
        if not messages.exists():
            chatbot = FoodOrderingChatbot(user=request.user, session_id=instance.session_id)
            greeting = chatbot._generate_greeting()
            username = request.user.get_full_name() or request.user.username
            
            data['messages'] = [{
                'id': str(uuid.uuid4()),
                'message_type': 'bot',
                'content': f"{greeting} {username}! Tôi có thể giúp gì cho bạn hôm nay?",
                'metadata': {
                    'suggestions': [
                        'Xem thực đơn',
                        'Gợi ý món ngon',
                        'Kiểm tra đơn hàng'
                    ]
                },
                'created_at': timezone.now().isoformat()
            }]
        
        return Response(data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({'message': 'Đã xóa cuộc trò chuyện', 'session_id': str(instance.session_id)})


class ChatSessionClearView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, *args, **kwargs):
        queryset = ChatSession.objects.filter(user=request.user)
        deleted = queryset.count()
        queryset.delete()
        return Response({'message': 'Đã xóa lịch sử chat', 'deleted': deleted})

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def send_chat_message(request):
    """Send message to AI chatbot using the improved FoodOrderingChatbot"""
    import traceback
    
    # Log request data
    print("\n=== Incoming Chat Request ===")
    print(f"User: {request.user}")
    print(f"Data: {request.data}")
    
    try:
        # Validate input
        serializer = SendMessageSerializer(data=request.data)
        if not serializer.is_valid():
            print(f"Validation Error: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        message = serializer.validated_data['message']
        session_id = serializer.validated_data.get('session_id')
        print(f"Processing message: {message}")
        print(f"Session ID: {session_id}")
        
        # Initialize chatbot
        try:
            print("Initializing chatbot...")
            chatbot = FoodOrderingChatbot(user=request.user, session_id=session_id)
            if not chatbot.session or not getattr(chatbot.session, 'session_id', None):
                return Response({'error': 'Không thể khởi tạo phiên trò chuyện.'}, status=500)
            print(f"Chatbot initialized with session: {getattr(chatbot.session, 'session_id', 'UNKNOWN_SESSION')}")
        except Exception as e:
            print(f"Error initializing chatbot: {str(e)}\n{traceback.format_exc()}")
            raise
        
        # Save user message
        user_msg = None
        try:
            print("Saving user message...")
            user_msg = ChatMessage.objects.create(
                session=chatbot.session,
                message_type='user',
                content=message
            )
            print(f"User message saved with ID: {user_msg.id}")
        except Exception as e:
            print(f"Error saving user message: {str(e)}\n{traceback.format_exc()}")
            # Create fallback user message dict
            user_msg = {
                'id': 'temp-user-'+str(uuid.uuid4()),
                'message_type': 'user',
                'content': message,
                'created_at': timezone.now().isoformat()
            }
        
        # Process message
        try:
            print("Processing message with chatbot...")
            response = chatbot.process_message(message)
            print(f"Chatbot response: {response}")
        except Exception as e:
            print(f"Error processing message: {str(e)}\n{traceback.format_exc()}")
            # Return a friendly error response
            response = {
                'text': 'Xin lỗi, tôi gặp chút khó khăn khi xử lý yêu cầu của bạn. Bạn vui lòng thử lại sau nhé!',
                'suggestions': ['Bắt đầu lại', 'Liên hệ hỗ trợ', 'Xem thực đơn']
            }
        
        # Save bot response
        try:
            print("Saving bot response...")
            bot_msg = ChatMessage.objects.create(
                session=chatbot.session,
                message_type='bot',
                content=response.get('text', 'Xin lỗi, tôi không thể xử lý yêu cầu này ngay lúc này.'),
                metadata={
                    'suggestions': response.get('suggestions', []),
                    'actions': response.get('actions', []),
                    **response.get('metadata', {})
                }
            )
            print(f"Bot message saved with ID: {bot_msg.id}")
        except Exception as e:
            print(f"Error saving bot message: {str(e)}\n{traceback.format_exc()}")
            # Create a minimal response if saving fails
            bot_msg = {
                'id': 'error-'+str(uuid.uuid4()),
                'message_type': 'bot',
                'content': 'Xin lỗi, có lỗi xảy ra khi xử lý tin nhắn của bạn.',
                'metadata': {},
                'created_at': timezone.now().isoformat()
            }
        
        # Update session title if it's the first message
        try:
            if chatbot.session.title == 'New Chat':
                title = message[:30] + '...' if len(message) > 30 else message
                chatbot.session.title = title or f"Chat - {timezone.now().strftime('%d/%m/%Y %H:%M')}"
                chatbot.session.save()
                print(f"Updated session title to: {chatbot.session.title}")
        except Exception as e:
            print(f"Error updating session title: {str(e)}")
            # Non-critical error, continue
        
        # Prepare response - handle both object and dict for bot_msg
        if isinstance(bot_msg, dict):
            bot_message_data = {
                'id': bot_msg.get('id', 'error-'+str(uuid.uuid4())),
                'message_type': bot_msg.get('message_type', 'bot'),
                'content': bot_msg.get('content', 'Xin lỗi, tôi không thể xử lý yêu cầu này ngay lúc này.'),
                'metadata': bot_msg.get('metadata', {}),
                'created_at': bot_msg.get('created_at', timezone.now().isoformat())
            }
        else:
            bot_message_data = {
                'id': str(bot_msg.id),
                'message_type': 'bot',
                'content': bot_msg.content,
                'metadata': bot_msg.metadata or {},
                'created_at': bot_msg.created_at.isoformat()
            }
        
        # Handle user_msg - could be object or dict
        if isinstance(user_msg, dict):
            user_message_data = user_msg
        else:
            user_message_data = {
                'id': str(user_msg.id),
                'message_type': 'user',
                'content': user_msg.content,
                'created_at': user_msg.created_at.isoformat()
            }
        
        response_data = {
            'session_id': str(chatbot.session.session_id),
            'messages': [
                user_message_data,
                bot_message_data
            ]
        }
        
        print("=== End of Chat Request ===\n")
        return Response(response_data)
        
    except Exception as e:
        error_id = str(uuid.uuid4())
        error_msg = f"Error ID: {error_id} - {str(e)}"
        print(f"\n!!! CRITICAL ERROR: {error_msg}")
        print(traceback.format_exc())
        print("=== End of Error ===\n")
        
        return Response(
            {
                'error': 'Có lỗi xảy ra khi xử lý tin nhắn. Vui lòng thử lại sau.',
                'error_id': error_id,
                'detail': str(e) if settings.DEBUG else None
            }, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

def extract_food_name(message):
    """
    Extract food name from user message by removing common question words and phrases
    
    Args:
        message (str): User's message
        
    Returns:
        str: Extracted food name or None if not found
    """
    if not message or not isinstance(message, str):
        return None
        
    # Common question words and phrases to remove
    question_words = [
        'tôi muốn', 'tôi cần', 'cho tôi', 'có', 'bán', 'phục vụ', 'có bán', 'có phục vụ',
        'có món', 'có đồ', 'có thức', 'có nước', 'có gì', 'bạn có', 'nhà hàng có',
        'quán có', 'ở đây có', 'ở đây bán', 'ở đây phục vụ', 'ở đây có bán',
        'ở đây có phục vụ', 'ở đây có món', 'ở đây có đồ', 'ở đây có thức',
        'ở đây có nước', 'ở đây có gì', 'có món gì', 'có đồ gì', 'có thức gì',
        'có nước gì', 'có gì ngon', 'có gì hót', 'có gì mới', 'có gì đặc biệt',
        'có gì nổi bật', 'có gì đáng thử', 'có gì đáng ăn', 'có gì đáng uống',
        'có gì đáng gọi', 'có gì đáng order', 'có gì đáng đặt', 'có gì đáng thử',
        'có gì đáng ăn thử', 'có gì đáng uống thử', 'có gì đáng gọi thử',
        'có gì đáng order thử', 'có gì đáng đặt thử', 'có gì đáng ăn thử không',
        'có gì đáng uống thử không', 'có gì đáng gọi thử không',
        'có gì đáng order thử không', 'có gì đáng đặt thử không',
        'có gì ngon không', 'có gì hót không', 'có gì mới không',
        'có gì đặc biệt không', 'có gì nổi bật không', 'có gì đáng thử không',
        'có gì đáng ăn không', 'có gì đáng uống không', 'có gì đáng gọi không',
        'có gì đáng order không', 'có gì đáng đặt không', 'có gì đáng ăn thử không',
        'có gì đáng uống thử không', 'có gì đáng gọi thử không',
        'có gì đáng order thử không', 'có gì đáng đặt thử không',
        'có món gì ngon', 'có món gì hót', 'có món gì mới', 'có món gì đặc biệt',
        'có món gì nổi bật', 'có món gì đáng thử', 'có món gì đáng ăn',
        'có món gì đáng uống', 'có món gì đáng gọi', 'có món gì đáng order',
        'có món gì đáng đặt', 'có món gì đáng ăn thử', 'có món gì đáng uống thử',
        'có món gì đáng gọi thử', 'có món gì đáng order thử',
        'có món gì đáng đặt thử', 'có món gì ngon không', 'có món gì hót không',
        'có món gì mới không', 'có món gì đặc biệt không',
        'có món gì nổi bật không', 'có món gì đáng thử không',
        'có món gì đáng ăn không', 'có món gì đáng uống không',
        'có món gì đáng gọi không', 'có món gì đáng order không',
        'có món gì đáng đặt không', 'có món gì đáng ăn thử không',
        'có món gì đáng uống thử không', 'có món gì đáng gọi thử không',
        'có món gì đáng order thử không', 'có món gì đáng đặt thử không',
        'tôi muốn ăn', 'tôi muốn uống', 'tôi muốn gọi', 'tôi muốn order',
        'tôi muốn đặt', 'tôi muốn thử', 'tôi muốn ăn thử', 'tôi muốn uống thử',
        'tôi muốn gọi thử', 'tôi muốn order thử', 'tôi muốn đặt thử',
        'cho tôi', 'cho tôi món', 'cho tôi đồ', 'cho tôi thức', 'cho tôi nước',
        'cho tôi gì', 'cho tôi món gì', 'cho tôi đồ gì', 'cho tôi thức gì',
        'cho tôi nước gì', 'cho tôi gì đó', 'cho tôi món gì đó',
        'cho tôi đồ gì đó', 'cho tôi thức gì đó', 'cho tôi nước gì đó',
        'cho tôi cái gì đó', 'cho tôi món gì ngon', 'cho tôi đồ gì ngon',
        'cho tôi thức gì ngon', 'cho tôi nước gì ngon', 'cho tôi cái gì ngon',
        'cho tôi món gì hót', 'cho tôi đồ gì hót', 'cho tôi thức gì hót',
        'cho tôi nước gì hót', 'cho tôi cái gì hót', 'cho tôi món gì mới',
        'cho tôi đồ gì mới', 'cho tôi thức gì mới', 'cho tôi nước gì mới',
        'cho tôi cái gì mới', 'cho tôi món gì đặc biệt', 'cho tôi đồ gì đặc biệt',
        'cho tôi thức gì đặc biệt', 'cho tôi nước gì đặc biệt',
        'cho tôi cái gì đặc biệt', 'cho tôi món gì nổi bật',
        'cho tôi đồ gì nổi bật', 'cho tôi thức gì nổi bật',
        'cho tôi nước gì nổi bật', 'cho tôi cái gì nổi bật',
        'cho tôi món gì đáng thử', 'cho tôi đồ gì đáng thử',
        'cho tôi thức gì đáng thử', 'cho tôi nước gì đáng thử',
        'cho tôi cái gì đáng thử', 'cho tôi món gì đáng ăn',
        'cho tôi đồ gì đáng ăn', 'cho tôi thức gì đáng ăn',
        'cho tôi nước gì đáng ăn', 'cho tôi cái gì đáng ăn',
        'cho tôi món gì đáng uống', 'cho tôi đồ gì đáng uống',
        'cho tôi thức gì đáng uống', 'cho tôi nước gì đáng uống',
        'cho tôi cái gì đáng uống', 'cho tôi món gì đáng gọi',
        'cho tôi đồ gì đáng gọi', 'cho tôi thức gì đáng gọi',
        'cho tôi nước gì đáng gọi', 'cho tôi cái gì đáng gọi',
        'cho tôi món gì đáng order', 'cho tôi đồ gì đáng order',
        'cho tôi thức gì đáng order', 'cho tôi nước gì đáng order',
        'cho tôi cái gì đáng order', 'cho tôi món gì đáng đặt',
        'cho tôi đồ gì đáng đặt', 'cho tôi thức gì đáng đặt',
        'cho tôi nước gì đáng đặt', 'cho tôi cái gì đáng đặt',
        'cho tôi món gì đáng ăn thử', 'cho tôi đồ gì đáng ăn thử',
        'cho tôi thức gì đáng ăn thử', 'cho tôi nước gì đáng ăn thử',
        'cho tôi cái gì đáng ăn thử', 'cho tôi món gì đáng uống thử',
        'cho tôi đồ gì đáng uống thử', 'cho tôi thức gì đáng uống thử',
        'cho tôi nước gì đáng uống thử', 'cho tôi cái gì đáng uống thử',
        'cho tôi món gì đáng gọi thử', 'cho tôi đồ gì đáng gọi thử',
        'cho tôi thức gì đáng gọi thử', 'cho tôi nước gì đáng gọi thử',
        'cho tôi cái gì đáng gọi thử', 'cho tôi món gì đáng order thử',
        'cho tôi đồ gì đáng order thử', 'cho tôi thức gì đáng order thử',
        'cho tôi nước gì đáng order thử', 'cho tôi cái gì đáng order thử',
        'cho tôi món gì đáng đặt thử', 'cho tôi đồ gì đáng đặt thử',
        'cho tôi thức gì đáng đặt thử', 'cho tôi nước gì đáng đặt thử',
        'cho tôi cái gì đáng đặt thử', 'tôi thích', 'tôi thích ăn',
        'tôi thích uống', 'tôi thích gọi', 'tôi thích order', 'tôi thích đặt',
        'tôi thích thử', 'tôi thích ăn thử', 'tôi thích uống thử',
        'tôi thích gọi thử', 'tôi thích order thử', 'tôi thích đặt thử',
        'tôi muốn ăn', 'tôi muốn uống', 'tôi muốn gọi', 'tôi muốn order',
        'tôi muốn đặt', 'tôi muốn thử', 'tôi muốn ăn thử', 'tôi muốn uống thử',
        'tôi muốn gọi thử', 'tôi muốn order thử', 'tôi muốn đặt thử',
        'tôi đang đói', 'tôi đang khát', 'tôi đang thèm', 'tôi đang thèm ăn',
        'tôi đang thèm uống', 'tôi đang thèm gọi', 'tôi đang thèm order',
        'tôi đang thèm đặt', 'tôi đang thèm thử', 'tôi đang thèm ăn thử',
        'tôi đang thèm uống thử', 'tôi đang thèm gọi thử',
        'tôi đang thèm order thử', 'tôi đang thèm đặt thử',
        'tôi đang đói bụng', 'tôi đang khát nước', 'tôi đang thèm ăn',
        'tôi đang thèm uống', 'tôi đang thèm gì đó', 'tôi đang thèm ăn gì đó',
        'tôi đang thèm uống gì đó', 'tôi đang thèm gọi gì đó',
        'tôi đang thèm order gì đó', 'tôi đang thèm đặt gì đó',
        'tôi đang thèm thử gì đó', 'tôi đang thèm ăn thử gì đó',
        'tôi đang thèm uống thử gì đó', 'tôi đang thèm gọi thử gì đó',
        'tôi đang thèm order thử gì đó', 'tôi đang thèm đặt thử gì đó',
        'tôi đang đói bụng quá', 'tôi đang khát nước quá',
        'tôi đang thèm ăn quá', 'tôi đang thèm uống quá',
        'tôi đang thèm gì đó quá', 'tôi đang thèm ăn gì đó quá',
        'tôi đang thèm uống gì đó quá', 'tôi đang thèm gọi gì đó quá',
        'tôi đang thèm order gì đó quá', 'tôi đang thèm đặt gì đó quá',
        'tôi đang thèm thử gì đó quá', 'tôi đang thèm ăn thử gì đó quá',
        'tôi đang thèm uống thử gì đó quá', 'tôi đang thèm gọi thử gì đó quá',
        'tôi đang thèm order thử gì đó quá', 'tôi đang thèm đặt thử gì đó quá',
        'tôi đang rất đói', 'tôi đang rất khát', 'tôi đang rất thèm',
        'tôi đang rất thèm ăn', 'tôi đang rất thèm uống',
        'tôi đang rất thèm gọi', 'tôi đang rất thèm order',
        'tôi đang rất thèm đặt', 'tôi đang rất thèm thử',
        'tôi đang rất thèm ăn thử', 'tôi đang rất thèm uống thử',
        'tôi đang rất thèm gọi thử', 'tôi đang rất thèm order thử',
        'tôi đang rất thèm đặt thử', 'tôi đang rất đói bụng',
        'tôi đang rất khát nước', 'tôi đang rất thèm ăn',
        'tôi đang rất thèm uống', 'tôi đang rất thèm gì đó',
        'tôi đang rất thèm ăn gì đó', 'tôi đang rất thèm uống gì đó',
        'tôi đang rất thèm gọi gì đó', 'tôi đang rất thèm order gì đó',
        'tôi đang rất thèm đặt gì đó', 'tôi đang rất thèm thử gì đó',
        'tôi đang rất thèm ăn thử gì đó', 'tôi đang rất thèm uống thử gì đó',
        'tôi đang rất thèm gọi thử gì đó', 'tôi đang rất thèm order thử gì đó',
        'tôi đang rất thèm đặt thử gì đó', 'tôi đang rất đói bụng quá',
        'tôi đang rất khát nước quá', 'tôi đang rất thèm ăn quá',
        'tôi đang rất thèm uống quá', 'tôi đang rất thèm gì đó quá',
        'tôi đang rất thèm ăn gì đó quá', 'tôi đang rất thèm uống gì đó quá',
        'tôi đang rất thèm gọi gì đó quá', 'tôi đang rất thèm order gì đó quá',
        'tôi đang rất thèm đặt gì đó quá', 'tôi đang rất thèm thử gì đó quá',
        'tôi đang rất thèm ăn thử gì đó quá',
        'tôi đang rất thèm uống thử gì đó quá',
        'tôi đang rất thèm gọi thử gì đó quá',
        'tôi đang rất thèm order thử gì đó quá',
        'tôi đang rất thèm đặt thử gì đó quá', 'tôi đang cực kỳ đói',
        'tôi đang cực kỳ khát', 'tôi đang cực kỳ thèm', 'tôi đang cực kỳ thèm ăn',
        'tôi đang cực kỳ thèm uống', 'tôi đang cực kỳ thèm gọi',
        'tôi đang cực kỳ thèm order', 'tôi đang cực kỳ thèm đặt',
        'tôi đang cực kỳ thèm thử', 'tôi đang cực kỳ thèm ăn thử',
        'tôi đang cực kỳ thèm uống thử', 'tôi đang cực kỳ thèm gọi thử',
        'tôi đang cực kỳ thèm order thử', 'tôi đang cực kỳ thèm đặt thử',
        'tôi đang cực kỳ đói bụng', 'tôi đang cực kỳ khát nước',
        'tôi đang cực kỳ thèm ăn', 'tôi đang cực kỳ thèm uống',
        'tôi đang cực kỳ thèm gì đó', 'tôi đang cực kỳ thèm ăn gì đó',
        'tôi đang cực kỳ thèm uống gì đó', 'tôi đang cực kỳ thèm gọi gì đó',
        'tôi đang cực kỳ thèm order gì đó', 'tôi đang cực kỳ thèm đặt gì đó',
        'tôi đang cực kỳ thèm thử gì đó', 'tôi đang cực kỳ thèm ăn thử gì đó',
        'tôi đang cực kỳ thèm uống thử gì đó',
        'tôi đang cực kỳ thèm gọi thử gì đó',
        'tôi đang cực kỳ thèm order thử gì đó',
        'tôi đang cực kỳ thèm đặt thử gì đó', 'tôi đang cực kỳ đói bụng quá',
        'tôi đang cực kỳ khát nước quá', 'tôi đang cực kỳ thèm ăn quá',
        'tôi đang cực kỳ thèm uống quá', 'tôi đang cực kỳ thèm gì đó quá',
        'tôi đang cực kỳ thèm ăn gì đó quá',
        'tôi đang cực kỳ thèm uống gì đó quá',
        'tôi đang cực kỳ thèm gọi gì đó quá',
        'tôi đang cực kỳ thèm order gì đó quá',
        'tôi đang cực kỳ thèm đặt gì đó quá',
        'tôi đang cực kỳ thèm thử gì đó quá',
        'tôi đang cực kỳ thèm ăn thử gì đó quá',
        'tôi đang cực kỳ thèm uống thử gì đó quá',
        'tôi đang cực kỳ thèm gọi thử gì đó quá',
        'tôi đang cực kỳ thèm order thử gì đó quá',
        'tôi đang cực kỳ thèm đặt thử gì đó quá', 'tôi muốn gì đó',
        'tôi cần gì đó', 'tôi muốn ăn gì đó', 'tôi cần ăn gì đó',
        'tôi muốn uống gì đó', 'tôi cần uống gì đó', 'tôi muốn gọi gì đó',
        'tôi cần gọi gì đó', 'tôi muốn order gì đó', 'tôi cần order gì đó',
        'tôi muốn đặt gì đó', 'tôi cần đặt gì đó', 'tôi muốn thử gì đó',
        'tôi cần thử gì đó', 'tôi muốn ăn thử gì đó', 'tôi cần ăn thử gì đó',
        'tôi muốn uống thử gì đó', 'tôi cần uống thử gì đó',
        'tôi muốn gọi thử gì đó', 'tôi cần gọi thử gì đó',
        'tôi muốn order thử gì đó', 'tôi cần order thử gì đó',
        'tôi muốn đặt thử gì đó', 'tôi cần đặt thử gì đó', 'tôi muốn cái gì đó',
        'tôi cần cái gì đó', 'tôi muốn món gì đó', 'tôi cần món gì đó',
        'tôi muốn đồ gì đó', 'tôi cần đồ gì đó', 'tôi muốn thức gì đó',
        'tôi cần thức gì đó', 'tôi muốn nước gì đó', 'tôi cần nước gì đó',
        'tôi muốn cái gì đó ngon', 'tôi cần cái gì đó ngon',
        'tôi muốn món gì đó ngon', 'tôi cần món gì đó ngon',
        'tôi muốn đồ gì đó ngon', 'tôi cần đồ gì đó ngon',
        'tôi muốn thức gì đó ngon', 'tôi cần thức gì đó ngon',
        'tôi muốn nước gì đó ngon', 'tôi cần nước gì đó ngon',
        'tôi muốn cái gì đó hót', 'tôi cần cái gì đó hót',
        'tôi muốn món gì đó hót', 'tôi cần món gì đó hót',
        'tôi muốn đồ gì đó hót', 'tôi cần đồ gì đó hót',
        'tôi muốn thức gì đó hót', 'tôi cần thức gì đó hót',
        'tôi muốn nước gì đó hót', 'tôi cần nước gì đó hót',
        'tôi muốn cái gì đó mới', 'tôi cần cái gì đó mới',
        'tôi muốn món gì đó mới', 'tôi cần món gì đó mới',
        'tôi muốn đồ gì đó mới', 'tôi cần đồ gì đó mới',
        'tôi muốn thức gì đó mới', 'tôi cần thức gì đó mới',
        'tôi muốn nước gì đó mới', 'tôi cần nước gì đó mới',
        'tôi muốn cái gì đó đặc biệt', 'tôi cần cái gì đó đặc biệt',
        'tôi muốn món gì đó đặc biệt', 'tôi cần món gì đó đặc biệt',
        'tôi muốn đồ gì đó đặc biệt', 'tôi cần đồ gì đó đặc biệt',
        'tôi muốn thức gì đó đặc biệt', 'tôi cần thức gì đó đặc biệt',
        'tôi muốn nước gì đó đặc biệt', 'tôi cần nước gì đó đặc biệt',
        'tôi muốn cái gì đó nổi bật', 'tôi cần cái gì đó nổi bật',
        'tôi muốn món gì đó nổi bật', 'tôi cần món gì đó nổi bật',
        'tôi muốn đồ gì đó nổi bật', 'tôi cần đồ gì đó nổi bật',
        'tôi muốn thức gì đó nổi bật', 'tôi cần thức gì đó nổi bật',
        'tôi muốn nước gì đó nổi bật', 'tôi cần nước gì đó nổi bật',
        'tôi muốn cái gì đó đáng thử', 'tôi cần cái gì đó đáng thử',
        'tôi muốn món gì đó đáng thử', 'tôi cần món gì đó đáng thử',
        'tôi muốn đồ gì đó đáng thử', 'tôi cần đồ gì đó đáng thử',
        'tôi muốn thức gì đó đáng thử', 'tôi cần thức gì đó đáng thử',
        'tôi muốn nước gì đó đáng thử', 'tôi cần nước gì đó đáng thử',
        'tôi muốn cái gì đó đáng ăn', 'tôi cần cái gì đó đáng ăn',
        'tôi muốn món gì đó đáng ăn', 'tôi cần món gì đó đáng ăn',
        'tôi muốn đồ gì đó đáng ăn', 'tôi cần đồ gì đó đáng ăn',
        'tôi muốn thức gì đó đáng ăn', 'tôi cần thức gì đó đáng ăn',
        'tôi muốn nước gì đó đáng ăn', 'tôi cần nước gì đó đáng ăn',
        'tôi muốn cái gì đó đáng uống', 'tôi cần cái gì đó đáng uống',
        'tôi muốn món gì đó đáng uống', 'tôi cần món gì đó đáng uống',
        'tôi muốn đồ gì đó đáng uống', 'tôi cần đồ gì đó đáng uống',
        'tôi muốn thức gì đó đáng uống', 'tôi cần thức gì đó đáng uống',
        'tôi muốn nước gì đó đáng uống', 'tôi cần nước gì đó đáng uống',
        'tôi muốn cái gì đó đáng gọi', 'tôi cần cái gì đó đáng gọi',
        'tôi muốn món gì đó đáng gọi', 'tôi cần món gì đó đáng gọi',
        'tôi muốn đồ gì đó đáng gọi', 'tôi cần đồ gì đó đáng gọi',
        'tôi muốn thức gì đó đáng gọi', 'tôi cần thức gì đó đáng gọi',
        'tôi muốn nước gì đó đáng gọi', 'tôi cần nước gì đó đáng gọi',
        'tôi muốn cái gì đó đáng order', 'tôi cần cái gì đó đáng order',
        'tôi muốn món gì đó đáng order', 'tôi cần món gì đó đáng order',
        'tôi muốn đồ gì đó đáng order', 'tôi cần đồ gì đó đáng order',
        'tôi muốn thức gì đó đáng order', 'tôi cần thức gì đó đáng order',
        'tôi muốn nước gì đó đáng order', 'tôi cần nước gì đó đáng order',
        'tôi muốn cái gì đó đáng đặt', 'tôi cần cái gì đó đáng đặt',
        'tôi muốn món gì đó đáng đặt', 'tôi cần món gì đó đáng đặt',
        'tôi muốn đồ gì đó đáng đặt', 'tôi cần đồ gì đó đáng đặt',
        'tôi muốn thức gì đó đáng đặt', 'tôi cần thức gì đó đáng đặt',
        'tôi muốn nước gì đó đáng đặt', 'tôi cần nước gì đó đáng đặt',
        'tôi muốn cái gì đó đáng ăn thử', 'tôi cần cái gì đó đáng ăn thử',
        'tôi muốn món gì đó đáng ăn thử', 'tôi cần món gì đó đáng ăn thử',
        'tôi muốn đồ gì đó đáng ăn thử', 'tôi cần đồ gì đó đáng ăn thử',
        'tôi muốn thức gì đó đáng ăn thử', 'tôi cần thức gì đó đáng ăn thử',
        'tôi muốn nước gì đó đáng ăn thử', 'tôi cần nước gì đó đáng ăn thử',
        'tôi muốn cái gì đó đáng uống thử', 'tôi cần cái gì đó đáng uống thử',
        'tôi muốn món gì đó đáng uống thử', 'tôi cần món gì đó đáng uống thử',
        'tôi muốn đồ gì đó đáng uống thử', 'tôi cần đồ gì đó đáng uống thử',
        'tôi muốn thức gì đó đáng uống thử',
        'tôi cần thức gì đó đáng uống thử',
        'tôi muốn nước gì đó đáng uống thử',
        'tôi cần nước gì đó đáng uống thử',
        'tôi muốn cái gì đó đáng gọi thử', 'tôi cần cái gì đó đáng gọi thử',
        'tôi muốn món gì đó đáng gọi thử', 'tôi cần món gì đó đáng gọi thử',
        'tôi muốn đồ gì đó đáng gọi thử', 'tôi cần đồ gì đó đáng gọi thử',
        'tôi muốn thức gì đó đáng gọi thử', 'tôi cần thức gì đó đáng gọi thử',
        'tôi muốn nước gì đó đáng gọi thử', 'tôi cần nước gì đó đáng gọi thử',
        'tôi muốn cái gì đó đáng order thử', 'tôi cần cái gì đó đáng order thử',
        'tôi muốn món gì đó đáng order thử', 'tôi cần món gì đó đáng order thử',
        'tôi muốn đồ gì đó đáng order thử', 'tôi cần đồ gì đó đáng order thử',
        'tôi muốn thức gì đó đáng order thử',
        'tôi cần thức gì đó đáng order thử',
        'tôi muốn nước gì đó đáng order thử',
        'tôi cần nước gì đó đáng order thử',
        'tôi muốn cái gì đó đáng đặt thử', 'tôi cần cái gì đó đáng đặt thử',
        'tôi muốn món gì đó đáng đặt thử', 'tôi cần món gì đó đáng đặt thử',
        'tôi muốn đồ gì đó đáng đặt thử', 'tôi cần đồ gì đó đáng đặt thử',
        'tôi muốn thức gì đó đáng đặt thử', 'tôi cần thức gì đó đáng đặt thử',
        'tôi muốn nước gì đó đáng đặt thử', 'tôi cần nước gì đó đáng đặt thử',
        'tôi muốn cái gì đó ngon', 'tôi cần cái gì đó ngon',
        'tôi muốn món gì đó ngon', 'tôi cần món gì đó ngon',
        'tôi muốn đồ gì đó ngon', 'tôi cần đồ gì đó ngon',
        'tôi muốn thức gì đó ngon', 'tôi cần thức gì đó ngon',
        'tôi muốn nước gì đó ngon', 'tôi cần nước gì đó ngon',
        'tôi muốn cái gì đó hót', 'tôi cần cái gì đó hót',
        'tôi muốn món gì đó hót', 'tôi cần món gì đó hót',
        'tôi muốn đồ gì đó hót', 'tôi cần đồ gì đó hót',
        'tôi muốn thức gì đó hót', 'tôi cần thức gì đó hót',
        'tôi muốn nước gì đó hót', 'tôi cần nước gì đó hót',
        'tôi muốn cái gì đó mới', 'tôi cần cái gì đó mới',
        'tôi muốn món gì đó mới', 'tôi cần món gì đó mới',
        'tôi muốn đồ gì đó mới', 'tôi cần đồ gì đó mới',
        'tôi muốn thức gì đó mới', 'tôi cần thức gì đó mới',
        'tôi muốn nước gì đó mới', 'tôi cần nước gì đó mới',
        'tôi muốn cái gì đó đặc biệt', 'tôi cần cái gì đó đặc biệt',
        'tôi muốn món gì đó đặc biệt', 'tôi cần món gì đó đặc biệt',
        'tôi muốn đồ gì đó đặc biệt', 'tôi cần đồ gì đó đặc biệt',
        'tôi muốn thức gì đó đặc biệt', 'tôi cần thức gì đó đặc biệt',
        'tôi muốn nước gì đó đặc biệt', 'tôi cần nước gì đó đặc biệt',
        'tôi muốn cái gì đó nổi bật', 'tôi cần cái gì đó nổi bật',
        'tôi muốn món gì đó nổi bật', 'tôi cần món gì đó nổi bật',
        'tôi muốn đồ gì đó nổi bật', 'tôi cần đồ gì đó nổi bật',
        'tôi muốn thức gì đó nổi bật', 'tôi cần thức gì đó nổi bật',
        'tôi muốn nước gì đó nổi bật', 'tôi cần nước gì đó nổi bật',
        'tôi muốn cái gì đó đáng thử', 'tôi cần cái gì đó đáng thử',
        'tôi muốn món gì đó đáng thử', 'tôi cần món gì đó đáng thử',
        'tôi muốn đồ gì đó đáng thử', 'tôi cần đồ gì đó đáng thử',
        'tôi muốn thức gì đó đáng thử', 'tôi cần thức gì đó đáng thử',
        'tôi muốn nước gì đó đáng thử', 'tôi cần nước gì đó đáng thử',
        'tôi muốn cái gì đó đáng ăn', 'tôi cần cái gì đó đáng ăn',
        'tôi muốn món gì đó đáng ăn', 'tôi cần món gì đó đáng ăn',
        'tôi muốn đồ gì đó đáng ăn', 'tôi cần đồ gì đó đáng ăn',
        'tôi muốn thức gì đó đáng ăn', 'tôi cần thức gì đó đáng ăn',
        'tôi muốn nước gì đó đáng ăn', 'tôi cần nước gì đó đáng ăn',
        'tôi muốn cái gì đó đáng uống', 'tôi cần cái gì đó đáng uống',
        'tôi muốn món gì đó đáng uống', 'tôi cần món gì đó đáng uống',
        'tôi muốn đồ gì đó đáng uống', 'tôi cần đồ gì đó đáng uống',
        'tôi muốn thức gì đó đáng uống', 'tôi cần thức gì đó đáng uống',
        'tôi muốn nước gì đó đáng uống', 'tôi cần nước gì đó đáng uống',
        'tôi muốn cái gì đó đáng gọi', 'tôi cần cái gì đó đáng gọi',
        'tôi muốn món gì đó đáng gọi', 'tôi cần món gì đó đáng gọi',
        'tôi muốn đồ gì đó đáng gọi', 'tôi cần đồ gì đó đáng gọi',
        'tôi muốn thức gì đó đáng gọi', 'tôi cần thức gì đó đáng gọi',
        'tôi muốn nước gì đó đáng gọi', 'tôi cần nước gì đó đáng gọi',
        'tôi muốn cái gì đó đáng order', 'tôi cần cái gì đó đáng order',
        'tôi muốn món gì đó đáng order', 'tôi cần món gì đó đáng order',
        'tôi muốn đồ gì đó đáng order', 'tôi cần đồ gì đó đáng order',
        'tôi muốn thức gì đó đáng order', 'tôi cần thức gì đó đáng order',
        'tôi muốn nước gì đó đáng order', 'tôi cần nước gì đó đáng order',
        'tôi muốn cái gì đó đáng đặt', 'tôi cần cái gì đó đáng đặt',
        'tôi muốn món gì đó đáng đặt', 'tôi cần món gì đó đáng đặt',
        'tôi muốn đồ gì đó đáng đặt', 'tôi cần đồ gì đó đáng đặt',
        'tôi muốn thức gì đó đáng đặt', 'tôi cần thức gì đó đáng đặt',
        'tôi muốn nước gì đó đáng đặt', 'tôi cần nước gì đó đáng đặt',
        'tôi muốn cái gì đó đáng ăn thử', 'tôi cần cái gì đó đáng ăn thử',
        'tôi muốn món gì đó đáng ăn thử', 'tôi cần món gì đó đáng ăn thử',
        'tôi muốn đồ gì đó đáng ăn thử', 'tôi cần đồ gì đó đáng ăn thử',
        'tôi muốn thức gì đó đáng ăn thử', 'tôi cần thức gì đó đáng ăn thử',
        'tôi muốn nước gì đó đáng ăn thử', 'tôi cần nước gì đó đáng ăn thử',
        'tôi muốn cái gì đó đáng uống thử', 'tôi cần cái gì đó đáng uống thử',
        'tôi muốn món gì đó đáng uống thử', 'tôi cần món gì đó đáng uống thử',
        'tôi muốn đồ gì đó đáng uống thử', 'tôi cần đồ gì đó đáng uống thử',
        'tôi muốn thức gì đó đáng uống thử',
        'tôi cần thức gì đó đáng uống thử',
        'tôi muốn nước gì đó đáng uống thử',
        'tôi cần nước gì đó đáng uống thử',
        'tôi muốn cái gì đó đáng gọi thử', 'tôi cần cái gì đó đáng gọi thử',
        'tôi muốn món gì đó đáng gọi thử', 'tôi cần món gì đó đáng gọi thử',
        'tôi muốn đồ gì đó đáng gọi thử', 'tôi cần đồ gì đó đáng gọi thử',
        'tôi muốn thức gì đó đáng gọi thử', 'tôi cần thức gì đó đáng gọi thử',
        'tôi muốn nước gì đó đáng gọi thử', 'tôi cần nước gì đó đáng gọi thử',
        'tôi muốn cái gì đó đáng order thử', 'tôi cần cái gì đó đáng order thử',
        'tôi muốn món gì đó đáng order thử', 'tôi cần món gì đó đáng order thử',
        'tôi muốn đồ gì đó đáng order thử', 'tôi cần đồ gì đó đáng order thử',
        'tôi muốn thức gì đó đáng order thử',
        'tôi cần thức gì đó đáng order thử',
        'tôi muốn nước gì đó đáng order thử',
        'tôi cần nước gì đó đáng order thử',
        'tôi muốn cái gì đó đáng đặt thử', 'tôi cần cái gì đó đáng đặt thử',
        'tôi muốn món gì đó đáng đặt thử', 'tôi cần món gì đó đáng đặt thử',
        'tôi muốn đồ gì đó đáng đặt thử', 'tôi cần đồ gì đó đáng đặt thử',
        'tôi muốn thức gì đó đáng đặt thử', 'tôi cần thức gì đó đáng đặt thử',
        'tôi muốn nước gì đó đáng đặt thử', 'tôi cần nước gì đó đáng đặt thử',
        'tôi muốn cái gì đó ngon', 'tôi cần cái gì đó ngon',
        'tôi muốn món gì đó ngon', 'tôi cần món gì đó ngon',
        'tôi muốn đồ gì đó ngon', 'tôi cần đồ gì đó ngon',
        'tôi muốn thức gì đó ngon', 'tôi cần thức gì đó ngon',
        'tôi muốn nước gì đó ngon', 'tôi cần nước gì đó ngon',
        'tôi muốn cái gì đó hót', 'tôi cần cái gì đó hót',
        'tôi muốn món gì đó hót', 'tôi cần món gì đó hót',
        'tôi muốn đồ gì đó hót', 'tôi cần đồ gì đó hót',
        'tôi muốn thức gì đó hót', 'tôi cần thức gì đó hót',
        'tôi muốn nước gì đó hót', 'tôi cần nước gì đó hót',
        'tôi muốn cái gì đó mới', 'tôi cần cái gì đó mới',
        'tôi muốn món gì đó mới', 'tôi cần món gì đó mới',
        'tôi muốn đồ gì đó mới', 'tôi cần đồ gì đó mới',
        'tôi muốn thức gì đó mới', 'tôi cần thức gì đó mới',
        'tôi muốn nước gì đó mới', 'tôi cần nước gì đó mới',
        'tôi muốn cái gì đó đặc biệt', 'tôi cần cái gì đó đặc biệt',
        'tôi muốn món gì đó đặc biệt', 'tôi cần món gì đó đặc biệt',
        'tôi muốn đồ gì đó đặc biệt', 'tôi cần đồ gì đó đặc biệt',
        'tôi muốn thức gì đó đặc biệt', 'tôi cần thức gì đó đặc biệt',
        'tôi muốn nước gì đó đặc biệt', 'tôi cần nước gì đó đặc biệt',
        'tôi muốn cái gì đó nổi bật', 'tôi cần cái gì đó nổi bật',
        'tôi muốn món gì đó nổi bật', 'tôi cần món gì đó nổi bật',
        'tôi muốn đồ gì đó nổi bật', 'tôi cần đồ gì đó nổi bật',
        'tôi muốn thức gì đó nổi bật', 'tôi cần thức gì đó nổi bật',
        'tôi muốn nước gì đó nổi bật', 'tôi cần nước gì đó nổi bật',
        'tôi muốn cái gì đó đáng thử', 'tôi cần cái gì đó đáng thử',
        'tôi muốn món gì đó đáng thử', 'tôi cần món gì đó đáng thử',
        'tôi muốn đồ gì đó đáng thử', 'tôi cần đồ gì đó đáng thử',
        'tôi muốn thức gì đó đáng thử', 'tôi cần thức gì đó đáng thử',
        'tôi muốn nước gì đó đáng thử', 'tôi cần nước gì đó đáng thử',
        'tôi muốn cái gì đó đáng ăn', 'tôi cần cái gì đó đáng ăn',
        'tôi muốn món gì đó đáng ăn', 'tôi cần món gì đó đáng ăn',
        'tôi muốn đồ gì đó đáng ăn', 'tôi cần đồ gì đó đáng ăn',
        'tôi muốn thức gì đó đáng ăn', 'tôi cần thức gì đó đáng ăn',
        'tôi muốn nước gì đó đáng ăn', 'tôi cần nước gì đó đáng ăn',
        'tôi muốn cái gì đó đáng uống', 'tôi cần cái gì đó đáng uống',
        'tôi muốn món gì đó đáng uống', 'tôi cần món gì đó đáng uống',
        'tôi muốn đồ gì đó đáng uống', 'tôi cần đồ gì đó đáng uống',
        'tôi muốn thức gì đó đáng uống', 'tôi cần thức gì đó đáng uống',
        'tôi muốn nước gì đó đáng uống', 'tôi cần nước gì đó đáng uống',
        'tôi muốn cái gì đó đáng gọi', 'tôi cần cái gì đó đáng gọi',
        'tôi muốn món gì đó đáng gọi', 'tôi cần món gì đó đáng gọi',
        'tôi muốn đồ gì đó đáng gọi', 'tôi cần đồ gì đó đáng gọi',
        'tôi muốn thức gì đó đáng gọi', 'tôi cần thức gì đó đáng gọi',
        'tôi muốn nước gì đó đáng gọi', 'tôi cần nước gì đó đáng gọi',
        'tôi muốn cái gì đó đáng order', 'tôi cần cái gì đó đáng order',
        'tôi muốn món gì đó đáng order', 'tôi cần món gì đó đáng order',
        'tôi muốn đồ gì đó đáng order', 'tôi cần đồ gì đó đáng order',
        'tôi muốn thức gì đó đáng order', 'tôi cần thức gì đó đáng order',
        'tôi muốn nước gì đó đáng order', 'tôi cần nước gì đó đáng order',
        'tôi muốn cái gì đó đáng đặt', 'tôi cần cái gì đó đáng đặt',
        'tôi muốn món gì đó đáng đặt', 'tôi cần món gì đó đáng đặt',
        'tôi muốn đồ gì đó đáng đặt', 'tôi cần đồ gì đó đáng đặt',
        'tôi muốn thức gì đó đáng đặt', 'tôi cần thức gì đó đáng đặt',
        'tôi muốn nước gì đó đáng đặt', 'tôi cần nước gì đó đáng đặt',
        'tôi muốn cái gì đó đáng ăn thử', 'tôi cần cái gì đó đáng ăn thử',
        'tôi muốn món gì đó đáng ăn thử', 'tôi cần món gì đó đáng ăn thử',
        'tôi muốn đồ gì đó đáng ăn thử', 'tôi cần đồ gì đó đáng ăn thử',
        'tôi muốn thức gì đó đáng ăn thử', 'tôi cần thức gì đó đáng ăn thử',
        'tôi muốn nước gì đó đáng ăn thử', 'tôi cần nước gì đó đáng ăn thử',
        'tôi muốn cái gì đó đáng uống thử', 'tôi cần cái gì đó đáng uống thử',
        'tôi muốn món gì đó đáng uống thử', 'tôi cần món gì đó đáng uống thử',
        'tôi muốn đồ gì đó đáng uống thử', 'tôi cần đồ gì đó đáng uống thử',
        'tôi muốn thức gì đó đáng uống thử',
        'tôi cần thức gì đó đáng uống thử',
        'tôi muốn nước gì đó đáng uống thử',
        'tôi cần nước gì đó đáng uống thử',
        'tôi muốn cái gì đó đáng gọi thử', 'tôi cần cái gì đó đáng gọi thử',
        'tôi muốn món gì đó đáng gọi thử', 'tôi cần món gì đó đáng gọi thử',
        'tôi muốn đồ gì đó đáng gọi thử', 'tôi cần đồ gì đó đáng gọi thử',
        'tôi muốn thức gì đó đáng gọi thử', 'tôi cần thức gì đó đáng gọi thử',
        'tôi muốn nước gì đó đáng gọi thử', 'tôi cần nước gì đó đáng gọi thử',
        'tôi muốn cái gì đó đáng order thử', 'tôi cần cái gì đó đáng order thử',
        'tôi muốn món gì đó đáng order thử', 'tôi cần món gì đó đáng order thử',
        'tôi muốn đồ gì đó đáng order thử', 'tôi cần đồ gì đó đáng order thử',
        'tôi muốn thức gì đó đáng order thử',
        'tôi cần thức gì đó đáng order thử',
        'tôi muốn nước gì đó đáng order thử',
        'tôi cần nước gì đó đáng order thử',
        'tôi muốn cái gì đó đáng đặt thử', 'tôi cần cái gì đó đáng đặt thử',
        'tôi muốn món gì đó đáng đặt thử', 'tôi cần món gì đó đáng đặt thử',
        'tôi muốn đồ gì đó đáng đặt thử', 'tôi cần đồ gì đó đáng đặt thử',
        'tôi muốn thức gì đó đáng đặt thử', 'tôi cần thức gì đó đáng đặt thử',
        'tôi muốn nước gì đó đáng đặt thử', 'tôi cần nước gì đó đáng đặt thử',
    ]
    
    # Remove question words and phrases
    for word in question_words:
        message = message.lower().replace(word.lower(), '').strip()
    
    # Remove extra spaces and return
    food_name = ' '.join(message.split())
    return food_name if food_name and len(food_name) > 1 else None


def load_training_data():
    """Load Q&A training data từ file JSON"""
    try:
        with open("ai_features/data/qa_dataset.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading training data: {e}")
        return []


def generate_ai_response(message, user, session):
    """Generate AI response with food data from database"""
    try:
        # 1. First, check if it's a food-related query
        food_keywords = [
            'món', 'đồ ăn', 'thức ăn', 'đồ uống', 'nước uống', 'đặt món', 'gọi món', 
            'thực đơn', 'menu', 'có món gì', 'giới thiệu món', 'tư vấn món', 'ăn gì',
            'có gì ngon', 'gợi ý món', 'bán', 'phục vụ', 'có bán', 'có phục vụ',
            'tìm món', 'kiếm món', 'order', 'đặt hàng', 'gọi đồ', 'đồ ăn gì', 'uống gì'
        ]
        
        # Check if message contains any food-related keywords or is a question about food
        message_lower = message.lower()
        is_food_query = (
            any(keyword in message_lower for keyword in food_keywords) or
            any(q in message_lower for q in ['có món', 'có bán', 'có đồ', 'có thức', 'có nước', 'có gì'])
        )
        
        if is_food_query:
            try:
                # Extract food name from the message
                food_name = extract_food_name(message)
                food_results = search_food_in_database(food_name or message)
                
                if food_results:
                    # Group by category
                    categories = {}
                    for food in food_results:
                        category_name = food.get('category', 'Món khác')
                        if category_name not in categories:
                            categories[category_name] = []
                        categories[category_name].append(food)
                    
                    # Format response text
                    response_text = ""
                    if food_name:
                        response_text = f"Dưới đây là các món {food_name} ngon bạn có thể thử:\n\n"
                    else:
                        response_text = "Dưới đây là các món ăn phù hợp với yêu cầu của bạn:\n\n"
                    
                    for category, items in categories.items():
                        response_text += f"🍽️ *{category}*\n"
                        for item in items:
                            price = f"{int(float(item['price'])):,}đ"
                            if item.get('discount_price'):
                                price = f"<s>{price}</s> {int(float(item['discount_price'])):,}đ"
                            
                            # Add restaurant name if available
                            restaurant_info = f" ({item['restaurant']['name']})" if item.get('restaurant', {}).get('name') else ""
                            
                            # Add rating if available
                            rating_info = f" ⭐ {item['rating']:.1f}" if item.get('rating') else ""
                            
                            response_text += f"- {item['name']}{restaurant_info} - {price}{rating_info}\n"
                            
                            # Add description if available
                            if item.get('description'):
                                response_text += f"  {item['description']}\n"
                            # Add ingredients if available
                            if item.get('ingredients'):
                                ingredients = ", ".join(item['ingredients'])
                                response_text += f"  🧂 Nguyên liệu: {ingredients}\n"
                            # Add preparation time if available
                            if item.get('preparation_time'):
                                response_text += f"  ⏱️ Thời gian chuẩn bị: {item['preparation_time']} phút\n"
                                
                            response_text += "\n"
                    
                    # Add suggestion for ordering
                    response_text += "\nBạn muốn đặt món nào ạ?"
                    
                    return {
                        'response': response_text,
                        'type': 'food_list',
                        'data': food_results,
                        'status': 'success',
                        'metadata': {
                            'intent': 'food_search',
                            'food_query': food_name or message,
                            'result_count': len(food_results)
                        }
                    }
                else:
                    # If no food found, suggest alternatives
                    return {
                        'response': (
                            f"Xin lỗi, hiện tại chúng tôi chưa có món phù hợp với '{message}'.\n"
                            "Bạn có thể thử tìm kiếm với từ khóa khác hoặc xem thực đơn đầy đủ."
                        ),
                        'type': 'text',
                        'data': None,
                        'status': 'no_results',
                        'metadata': {
                            'intent': 'food_search',
                            'food_query': message,
                            'suggestions': [
                                'Xem thực đơn đầy đủ',
                                'Món bán chạy',
                                'Đồ uống',
                                'Đồ ăn nhanh'
                            ]
                        }
                    }
                    
            except Exception as e:
                print(f"Error searching food: {str(e)}")
                return {
                    'response': (
                        "Xin lỗi, tôi đang gặp sự cố khi tìm kiếm món ăn. "
                        "Bạn vui lòng thử lại sau nhé!"
                    ),
                    'type': 'text',
                    'data': None,
                    'status': 'error',
                    'metadata': {
                        'error': str(e),
                        'intent': 'food_search',
                        'food_query': message
                    }
                }
        
        # 2. Check Q&A training data
        try:
            training_data = load_training_data()
            for item in training_data:
                if item["question"].lower() in message.lower():
                    return {
                        'response': item["answer"],
                        'type': 'text',
                        'data': None,
                        'status': 'success'
                    }
        except Exception as e:
            print(f"Error loading training data: {str(e)}")

        # 3. Fallback to OpenAI with better error handling
        try:
            recent_messages = ChatMessage.objects.filter(session=session).order_by("-created_at")[:10]
            conversation_history = []
            for msg in reversed(recent_messages):
                role = "user" if msg.message_type == "user" else "assistant"
                conversation_history.append({"role": role, "content": msg.content})

            user_context = get_user_context(user)

            system_prompt = f"""
            Bạn là một AI assistant chuyên về đặt đồ ăn trực tuyến. Bạn có thể:
            1. Tư vấn món ăn dựa trên sở thích
            2. Giới thiệu nhà hàng
            3. Hỗ trợ đặt hàng
            4. Trả lời câu hỏi về thực đơn

            Thông tin người dùng:
            - Tên: {user.get_full_name() if hasattr(user, 'get_full_name') else 'Khách'}
            - Loại tài khoản: {user.get_user_type_display() if hasattr(user, 'get_user_type_display') else 'Khách'}
            {user_context}

            Hãy trả lời bằng tiếng Việt, thân thiện và hữu ích.
            Nếu người dùng hỏi về món ăn, hãy gợi ý các món phù hợp từ thực đơn.
            """

            messages = [{"role": "system", "content": system_prompt}]
            messages.extend(conversation_history)
            messages.append({"role": "user", "content": message})

            response = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=messages,
                max_tokens=500,
                temperature=0.7
            )
            
            return {
                'response': response.choices[0].message['content'],
                'type': 'text',
                'data': None,
                'status': 'success'
            }
            
        except Exception as e:
            print(f"Error calling OpenAI: {str(e)}")
            return {
                'response': "Xin lỗi, tôi đang gặp sự cố khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.",
                'type': 'text',
                'data': None,
                'status': 'error'
            }
        
    except Exception as e:
        print(f"Error generating AI response: {str(e)}")
        return {
            'response': "Xin lỗi, tôi đang gặp sự cố. Vui lòng thử lại sau.",
            'type': 'text',
            'data': None
        }

def search_food_in_database(query, limit=20):
    """
    Search for food items in the database based on query
    
    Args:
        query (str): The search query from user
        limit (int): Maximum number of results to return
        
    Returns:
        list: List of food items with details
    """
    from restaurants.models import Food, Category
    from django.db.models import Q, F, Case, When, Value, IntegerField
    from django.db.models.functions import Length, Replace
    
    if not query or not query.strip():
        return []
    
    # Clean and prepare search terms
    query = query.lower().strip()
    
    # Common Vietnamese words to ignore in search
    common_words = {
        'tôi', 'muốn', 'đặt', 'món', 'ăn', 'gọi', 'có', 'nào', 
        'không', 'cho', 'với', 'và', 'hoặc', 'một', 'hai', 'ba',
        'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười', 'cái',
        'phần', 'suất', 'dĩa', 'đĩa', 'tô', 'bát', 'ly', 'cốc'
    }
    
    # Split query into terms and remove common words
    query_terms = [term for term in query.split() if term not in common_words]
    
    if not query_terms:
        return []
    
    # Build the search query with ranking
    q_objects = Q()
    exact_match = Q()
    
    for term in query_terms:
        if len(term) < 2:
            continue
            
        # Exact matches get higher priority
        exact_match |= Q(name__iexact=term) | Q(category__name__iexact=term)
        
        # Partial matches
        q_objects |= (
            Q(name__icontains=term) |
            Q(description__icontains=term) |
            Q(ingredients__icontains=term) |
            Q(category__name__icontains=term) |
            Q(restaurant__name__icontains=term)
        )
    
    # Base queryset with select_related for performance
    base_queryset = Food.objects.filter(
        is_available=True,
        restaurant__is_active=True
    ).select_related('restaurant', 'category')
    
    # First try exact matches
    exact_matches = base_queryset.filter(exact_match).distinct()
    
    # Then try partial matches that don't match exactly
    partial_matches = base_queryset.filter(q_objects).exclude(pk__in=exact_matches.values_list('pk', flat=True))
    
    # Combine and order by relevance
    foods = (exact_matches | partial_matches).distinct()[:limit]
    
    # Prepare the response data
    food_list = []
    for food in foods:
        try:
            food_data = {
                'id': food.id,
                'name': food.name,
                'description': food.description or '',
                'price': str(food.price),
                'discount_price': str(food.discount_price) if food.discount_price and food.discount_price < food.price else None,
                'image': food.image.url if food.image else None,
                'restaurant': {
                    'id': food.restaurant.id,
                    'name': food.restaurant.name,
                    'logo': food.restaurant.logo.url if food.restaurant.logo else None,
                    'rating': float(food.restaurant.rating) if food.restaurant.rating else 0.0
                },
                'category': food.category.name if food.category else 'Món khác',
                'is_available': food.is_available,
                'rating': float(food.rating) if food.rating else 0.0,
                'preparation_time': food.preparation_time,
                'ingredients': food.ingredients.split(',') if food.ingredients else []
            }
            
            # Calculate discount percentage if applicable
            if food_data['discount_price']:
                original_price = float(food.price)
                discount_price = float(food.discount_price)
                food_data['discount_percent'] = int(((original_price - discount_price) / original_price) * 100)
            
            food_list.append(food_data)
            
        except Exception as e:
            print(f"Error processing food {food.id}: {str(e)}")
            continue
    
    return food_list

def get_user_context(user):
    """Get user context for AI"""
    context = ""
    
    try:
        # Get recent orders
        recent_orders = Order.objects.filter(customer=user).order_by('-created_at')[:3]
        if recent_orders:
            context += "\nĐơn hàng gần đây:\n"
            for order in recent_orders:
                context += f"- {order.restaurant.name} ({order.get_status_display()})\n"
        
        # Get preferences
        try:
            preferences = UserPreference.objects.get(user=user)
            if preferences.favorite_cuisines:
                context += f"\nSở thích: {', '.join(preferences.favorite_cuisines)}\n"
        except UserPreference.DoesNotExist:
            pass
            
    except Exception as e:
        print(f"Error getting user context: {e}")
    
    return context

def get_food_recommendations_for_chat(user):
    """Get food recommendations for chat response"""
    try:
        return FoodRecommendation.objects.filter(user=user).select_related('food', 'food__restaurant')[:5]
    except:
        return []

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def like_food(request):
    """Like/unlike a food item"""
    food_id = request.data.get('food_id')
    action = request.data.get('action', 'like')  # 'like' or 'unlike'
    
    if not food_id:
        return Response({'error': 'food_id is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        food = Food.objects.get(id=food_id)
        user_preference, _ = UserPreference.objects.get_or_create(user=request.user)
        
        if action == 'like':
            user_preference.liked_foods.add(food)
            message = 'Đã thêm vào danh sách yêu thích'
        else:
            user_preference.liked_foods.remove(food)
            message = 'Đã xóa khỏi danh sách yêu thích'
        
        return Response({'message': message})
        
    except Food.DoesNotExist:
        return Response({'error': 'Food not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_liked_foods(request):
    """Get user's liked foods"""
    try:
        user_preference = UserPreference.objects.get(user=request.user)
        liked_foods = user_preference.liked_foods.all()
        
        from restaurants.serializers import FoodSerializer
        serializer = FoodSerializer(liked_foods, many=True)
        return Response({'liked_foods': serializer.data})
        
    except UserPreference.DoesNotExist:
        return Response({'liked_foods': []})
