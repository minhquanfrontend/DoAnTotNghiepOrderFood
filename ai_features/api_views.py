from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .chatbot_service import FoodOrderingChatbot

class ChatbotView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        message = request.data.get('message', '').strip()
        session_id = request.data.get('session_id')
        
        if not message:
            return Response(
                {'error': 'Message is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Initialize chatbot with current user and session
            chatbot = FoodOrderingChatbot(user=request.user, session_id=session_id)
            # Defensive check for session
            if not chatbot.session or not getattr(chatbot.session, 'session_id', None):
                return Response({'error': 'Không thể khởi tạo phiên trò chuyện.'}, status=500)
            # Process the message
            response = chatbot.process_message(message)
            
            return Response({
                'success': True,
                'data': response
            })
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def get(self, request):
        # For getting chat history or initializing a new session
        session_id = request.query_params.get('session_id')
        
        try:
            chatbot = FoodOrderingChatbot(user=request.user, session_id=session_id)
            
            # Return session info and initial greeting
            greeting = chatbot._generate_greeting()
            username = request.user.get_full_name() or request.user.username
            
            return Response({
                'success': True,
                'data': {
                    'session_id': chatbot.session.session_id,
                    'greeting': f"{greeting} {username}!",
                    'suggestions': [
                        'Xem thực đơn',
                        'Gợi ý món ngon',
                        'Kiểm tra đơn hàng'
                    ]
                }
            })
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
