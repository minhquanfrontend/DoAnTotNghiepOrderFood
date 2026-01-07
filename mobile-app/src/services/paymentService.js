import { walletAPI, orderAPI } from './api';

class PaymentService {
  static async processOrderPayment(orderId, orderData) {
    try {
      console.log(`Processing payment for order ${orderId}`);
      
      // Get order details
      const order = orderData || await orderAPI.getOrder(orderId);
      const totalAmount = order.total_amount || order.total;
      
      // Calculate commission split (example: 80% for seller, 20% for shipper)
      const sellerAmount = totalAmount * 0.8;
      const shipperAmount = totalAmount * 0.2;
      
      // Process payment to seller
      if (sellerAmount > 0) {
        await this.creditSellerWallet(order.seller_id || order.restaurant_id, sellerAmount, orderId);
      }
      
      // Process payment to shipper
      if (shipperAmount > 0 && order.shipper_id) {
        await this.creditShipperWallet(order.shipper_id, shipperAmount, orderId);
      }
      
      console.log(`Payment processed successfully for order ${orderId}`);
      return {
        success: true,
        sellerAmount,
        shipperAmount,
        totalAmount
      };
      
    } catch (error) {
      console.error('Error processing payment:', error);
      throw error;
    }
  }

  static async creditSellerWallet(sellerId, amount, orderId) {
    try {
      const transactionData = {
        amount: amount,
        type: 'credit',
        source: 'order_payment',
        reference_id: orderId,
        description: `Thanh toán đơn hàng #${orderId}`,
        recipient_type: 'seller',
        recipient_id: sellerId
      };

      const response = await walletAPI.topUp(amount);
      console.log(`Credited ${amount} to seller ${sellerId} for order ${orderId}`);
      
      return response;
    } catch (error) {
      console.error('Error crediting seller wallet:', error);
      throw error;
    }
  }

  static async creditShipperWallet(shipperId, amount, orderId) {
    try {
      const transactionData = {
        amount: amount,
        type: 'credit',
        source: 'delivery_payment',
        reference_id: orderId,
        description: `Phí giao hàng đơn #${orderId}`,
        recipient_type: 'shipper',
        recipient_id: shipperId
      };

      const response = await walletAPI.topUp(amount);
      console.log(`Credited ${amount} to shipper ${shipperId} for order ${orderId}`);
      
      return response;
    } catch (error) {
      console.error('Error crediting shipper wallet:', error);
      throw error;
    }
  }

  static async getSellerEarnings(sellerId, period = 'today') {
    try {
      const params = { period };
      const response = await walletAPI.getTransactions(params);
      
      // Filter seller transactions
      const sellerTransactions = response.data?.filter(
        transaction => transaction.recipient_type === 'seller' && 
                       transaction.recipient_id === sellerId
      ) || [];
      
      const totalEarnings = sellerTransactions.reduce(
        (sum, transaction) => sum + transaction.amount, 0
      );
      
      return {
        totalEarnings,
        transactionCount: sellerTransactions.length,
        transactions: sellerTransactions
      };
    } catch (error) {
      console.error('Error getting seller earnings:', error);
      return {
        totalEarnings: 0,
        transactionCount: 0,
        transactions: []
      };
    }
  }

  static async getShipperEarnings(shipperId, period = 'today') {
    try {
      const params = { period };
      const response = await walletAPI.getTransactions(params);
      
      // Filter shipper transactions
      const shipperTransactions = response.data?.filter(
        transaction => transaction.recipient_type === 'shipper' && 
                       transaction.recipient_id === shipperId
      ) || [];
      
      const totalEarnings = shipperTransactions.reduce(
        (sum, transaction) => sum + transaction.amount, 0
      );
      
      return {
        totalEarnings,
        transactionCount: shipperTransactions.length,
        transactions: shipperTransactions
      };
    } catch (error) {
      console.error('Error getting shipper earnings:', error);
      return {
        totalEarnings: 0,
        transactionCount: 0,
        transactions: []
      };
    }
  }
}

export default PaymentService;
