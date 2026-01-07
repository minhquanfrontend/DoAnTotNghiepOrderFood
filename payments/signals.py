from paypal.standard.models import ST_PP_COMPLETED
from paypal.standard.ipn.signals import valid_ipn_received
from django.dispatch import receiver
from orders.models import Order
from .models import Payment

@receiver(valid_ipn_received)
def payment_notification(sender, **kwargs):
    ipn_obj = sender
    if ipn_obj.payment_status == ST_PP_COMPLETED:
        # Lấy invoice ID từ PayPal IPN
        invoice_id = ipn_obj.invoice
        try:
            payment = Payment.objects.get(id=invoice_id)
            order = payment.order

            # Kiểm tra xem đơn hàng đã được thanh toán chưa
            if order.payment_status != 'paid':
                payment.status = 'completed'
                payment.transaction_id = ipn_obj.txn_id
                payment.save()

                order.payment_status = 'paid'
                order.save()
        except Payment.DoesNotExist:
            print(f"Payment with invoice ID {invoice_id} not found.")
