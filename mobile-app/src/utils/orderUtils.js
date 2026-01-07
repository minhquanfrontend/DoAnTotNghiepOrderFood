export const normalizeOrder = (o) => ({
  id: o.id ?? o.order_id,
  order_number: o.order_number ?? `#${(o.id || "").toString().slice(-6)}`,
  customer: o.customer_name || o.customer_fullname || o.customer || "Khách vãng lai",
  total: Number(o.total_amount ?? o.total ?? 0),
  status: o.status || "pending",
  created_at: o.created_at,
  updated_at: o.updated_at,
  shipper_name: o.shipper?.name || o.shipper_name,
  payment_method: o.payment_method || "cod",
  items: Array.isArray(o.items) ? o.items : [],
  delivery_address: o.delivery_address || o.shipping_address || "Địa chỉ giao hàng",
  phone: o.phone || o.customer_phone || "Chưa có SĐT"
});



export const getStatusInfo = (status) => {
  const statusMap = {
    pending: { label: "🔄 Chờ xác nhận", color: "#ff9800" },
    confirmed: { label: "✅ Đã xác nhận", color: "#2196f3" },
    preparing: { label: "👨‍🍳 Đang chuẩn bị", color: "#673ab7" },
    ready: { label: "📦 Sẵn sàng giao", color: "#4caf50" },
    assigned: { label: "🚴 Shipper đã nhận đơn", color: "#00bcd4" },
    picked_up: { label: "🚶‍♂️ Shipper đã lấy hàng", color: "#009688" },
    delivering: { label: "🛵 Đang giao hàng", color: "#009688" },
    delivered: { label: "📬 Đã giao hàng", color: "#8bc34a" },
    completed: { label: "💰 Đã hoàn tất", color: "#4caf50" },
    cancelled_by_user: { label: "❌ Khách hủy", color: "#f44336" },
    cancelled_by_seller: { label: "❌ Nhà hàng hủy", color: "#f44336" },
    cancelled_by_shipper: { label: "❌ Shipper hủy", color: "#f44336" },
    failed_delivery: { label: "⚠️ Giao thất bại", color: "#ff5722" },
  };

  return statusMap[status] || { label: status, color: "#666" };
};

export const getNextStatus = (currentStatus, userType = 'seller') => {
  if (userType === 'shipper') {
    switch (currentStatus) {
      case 'ready': return 'delivering';
      case 'delivering': return 'completed';
      default: return currentStatus;
    }
  }
  
  // For seller
  switch (currentStatus) {
    case 'pending': return 'confirmed';
    case 'confirmed': return 'preparing';
    case 'preparing': return 'ready';
    default: return currentStatus;
  }
};

export const getActionLabel = (status, userType = 'seller') => {
  if (userType === 'shipper') {
    switch (status) {
      case 'ready': return 'Nhận đơn giao';
      case 'delivering': return 'Xác nhận đã giao';
      default: return 'Cập nhật';
    }
  }
  
  // For seller
  switch (status) {
    case 'pending': return 'Xác nhận đơn';
    case 'confirmed': return 'Bắt đầu nấu';
    case 'preparing': return 'Đã nấu xong, gọi shipper';
    default: return 'Cập nhật';
  }
};