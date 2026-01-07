import { notificationAPI } from './api';

class NotificationService {
  static async sendOrderNotification(orderId, status, recipient) {
    try {
      const message = this.getNotificationMessage(status, recipient);
      if (!message) {
        console.log(`No notification message for status: ${status}, recipient: ${recipient}`);
        return;
      }
      
      // Just log for now - actual push notification would be handled by backend
      console.log(`Notification for order ${orderId}: ${message} (recipient: ${recipient})`);
      
      // Note: In production, the backend should handle sending push notifications
      // when order status changes. This is just a placeholder.
    } catch (error) {
      console.log('Notification service info:', error?.message || 'No push notification sent');
    }
  }

  static getNotificationMessage(status, recipient) {
    const messages = {
      pending: {
        customer: 'Đơn hàng của bạn đang chờ xác nhận',
        seller: 'Có đơn hàng mới cần xác nhận',
        shipper: null
      },
      confirmed: {
        customer: 'Đơn hàng của bạn đã được xác nhận',
        seller: 'Đã xác nhận đơn hàng',
        shipper: null
      },
      preparing: {
        customer: 'Đơn hàng của bạn đang được chuẩn bị',
        seller: 'Đang chuẩn bị đơn hàng',
        shipper: null
      },
      ready: {
        customer: 'Đơn hàng của bạn sẵn sàng giao hàng',
        seller: 'Đơn hàng sẵn sàng, chờ shipper',
        shipper: 'Có đơn hàng mới sẵn sàng để nhận'
      },
      picked_up: {
        customer: 'Shipper đã nhận đơn hàng của bạn',
        seller: 'Shipper đã nhận đơn hàng',
        shipper: null
      },
      delivering: {
        customer: 'Đơn hàng của bạn đang được giao',
        seller: 'Đơn hàng đang được giao',
        shipper: null
      },
      delivered: {
        customer: 'Đơn hàng của bạn đã được giao thành công',
        seller: 'Đơn hàng đã giao thành công',
        shipper: 'Đã giao hàng thành công'
      },
      completed: {
        customer: 'Đơn hàng đã hoàn thành. Cảm ơn bạn!',
        seller: 'Đơn hàng đã hoàn thành. Thanh toán đã được xử lý',
        shipper: 'Đơn hàng đã hoàn thành. Thanh toán đã được xử lý'
      },
      cancelled: {
        customer: 'Đơn hàng của bạn đã bị hủy',
        seller: 'Đã hủy đơn hàng',
        shipper: null
      }
    };

    return messages[status]?.[recipient] || null;
  }

  static async notifyOrderStatusChange(orderId, newStatus, previousStatus) {
    // Notify customer
    await this.sendOrderNotification(orderId, newStatus, 'customer');
    
    // Notify seller if needed
    if (newStatus === 'pending') {
      await this.sendOrderNotification(orderId, newStatus, 'seller');
    }
    
    // Notify shipper when order is ready
    if (newStatus === 'ready') {
      await this.sendOrderNotification(orderId, newStatus, 'shipper');
    }
    
    // Notify all parties when order is completed
    if (newStatus === 'completed') {
      await this.sendOrderNotification(orderId, newStatus, 'customer');
      await this.sendOrderNotification(orderId, newStatus, 'seller');
      await this.sendOrderNotification(orderId, newStatus, 'shipper');
    }
  }
}

export default NotificationService;
