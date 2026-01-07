#!/usr/bin/env python
"""
Management command to ensure all restaurants have addresses for pickup locations
"""
import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'food_delivery.settings')
django.setup()

from django.core.management.base import BaseCommand
from restaurants.models import Restaurant

class Command(BaseCommand):
    help = 'Ensure all restaurants have addresses for pickup locations'

    def handle(self, *args, **options):
        restaurants_without_address = Restaurant.objects.filter(address__isnull=True) | Restaurant.objects.filter(address='')

        if not restaurants_without_address.exists():
            self.stdout.write(
                self.style.SUCCESS('✅ All restaurants already have addresses')
            )
            return

        self.stdout.write(f'Found {restaurants_without_address.count()} restaurants without addresses')

        # Default addresses for restaurants without addresses
        default_addresses = [
            "123 Đường ABC, Quận 1, TP.HCM",
            "456 Đường XYZ, Quận Bình Thạnh, TP.HCM",
            "789 Đường DEF, Quận Tân Bình, TP.HCM",
            "321 Đường GHI, Quận Gò Vấp, TP.HCM",
            "654 Đường JKL, Quận Phú Nhuận, TP.HCM",
        ]

        updated_count = 0
        for i, restaurant in enumerate(restaurants_without_address):
            default_address = default_addresses[i % len(default_addresses)]
            restaurant.address = default_address
            restaurant.save()
            updated_count += 1
            self.stdout.write(
                f'Updated {restaurant.name}: {default_address}'
            )

        self.stdout.write(
            self.style.SUCCESS(f'✅ Successfully updated {updated_count} restaurants with default addresses')
        )

        # Show summary
        total_restaurants = Restaurant.objects.count()
        restaurants_with_address = Restaurant.objects.filter(address__isnull=False).exclude(address='').count()

        self.stdout.write(
            self.style.SUCCESS(f'Total restaurants: {total_restaurants}')
        )
        self.stdout.write(
            self.style.SUCCESS(f'Restaurants with addresses: {restaurants_with_address}')
        )
