import json
from channels.generic.websocket import AsyncWebsocketConsumer

class OrderTrackingConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.order_id = self.scope['url_route']['kwargs']['order_id']
        self.room_group_name = f'track_{self.order_id}'

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    # Receive message from WebSocket (not used for now)
    async def receive(self, text_data):
        pass

    # Receive location update from room group
    async def location_update(self, event):
        location = event['location']

        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'location_update',
            'location': location
        }))
