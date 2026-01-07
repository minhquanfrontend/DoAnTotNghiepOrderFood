// Admin Dashboard Charts - Using Chart.js
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the admin index page and have chart data
    if (typeof chartLabels === 'undefined') return;
    
    // Revenue Chart
    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
        new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Doanh thu (VNĐ)',
                    data: chartRevenue,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return formatCurrency(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Orders Chart
    const ordersCtx = document.getElementById('ordersChart');
    if (ordersCtx) {
        new Chart(ordersCtx, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Đơn hàng',
                    data: chartOrders,
                    backgroundColor: '#007bff',
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }
    
    // Status Distribution Chart
    const statusCtx = document.getElementById('statusChart');
    if (statusCtx && typeof statusDistribution !== 'undefined') {
        const statusLabels = statusDistribution.map(s => getStatusLabel(s.status));
        const statusCounts = statusDistribution.map(s => s.count);
        const statusColors = statusDistribution.map(s => getStatusColor(s.status));
        
        new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: statusLabels,
                datasets: [{
                    data: statusCounts,
                    backgroundColor: statusColors,
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 12,
                            padding: 10,
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    }
});

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { 
        style: 'currency', 
        currency: 'VND',
        maximumFractionDigits: 0 
    }).format(amount);
}

// Get status label in Vietnamese
function getStatusLabel(status) {
    const labels = {
        'pending': 'Chờ xác nhận',
        'confirmed': 'Đã xác nhận',
        'preparing': 'Đang chuẩn bị',
        'ready': 'Sẵn sàng',
        'assigned': 'Đã giao shipper',
        'picked_up': 'Đã lấy hàng',
        'delivering': 'Đang giao',
        'delivered': 'Đã giao',
        'completed': 'Hoàn thành',
        'cancelled_by_user': 'Khách hủy',
        'cancelled_by_seller': 'Nhà hàng hủy',
        'cancelled_by_shipper': 'Shipper hủy',
    };
    return labels[status] || status;
}

// Get status color
function getStatusColor(status) {
    const colors = {
        'pending': '#ffc107',
        'confirmed': '#17a2b8',
        'preparing': '#6f42c1',
        'ready': '#20c997',
        'assigned': '#007bff',
        'picked_up': '#fd7e14',
        'delivering': '#e83e8c',
        'delivered': '#28a745',
        'completed': '#28a745',
        'cancelled_by_user': '#dc3545',
        'cancelled_by_seller': '#dc3545',
        'cancelled_by_shipper': '#dc3545',
    };
    return colors[status] || '#6c757d';
}
