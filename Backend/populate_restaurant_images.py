import sys
sys.stdout.reconfigure(encoding='utf-8')
import re
from db import get_connection

# Curated high-res Unsplash restaurant & dining imagery
THEME_IMAGES = {
    "kfc": "https://images.unsplash.com/photo-1513639776629-7b61b0ac49cb?auto=format&fit=crop&w=800&q=80",
    "pizza_hut": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
    "pizza_1": "https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=800&q=80",
    "pizza_2": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80",
    "pizza_3": "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&w=800&q=80",
    "burger_1": "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=800&q=80",
    "burger_2": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80",
    "burger_3": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
    "chicken": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=800&q=80",
    "biryani_1": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80",
    "biryani_2": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80",
    "biryani_3": "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=800&q=80",
    "kebab": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80",
    "sweets_1": "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80",
    "sweets_2": "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=800&q=80",
    "bakery_1": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
    "bakery_2": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80",
    "cafe_1": "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80",
    "cafe_2": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
    "cafe_3": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
    "cafe_4": "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=800&q=80",
    "tea_1": "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&q=80",
    "tea_2": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=800&q=80",
    "chinese_1": "https://images.unsplash.com/photo-1552611052-33e04de081de?auto=format&fit=crop&w=800&q=80",
    "chinese_2": "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80",
    "momo": "https://images.unsplash.com/photo-1625398407796-82650a8c135f?auto=format&fit=crop&w=800&q=80",
    "waffle_1": "https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=800&q=80",
    "waffle_2": "https://images.unsplash.com/photo-1528740561666-dc2479dc08ab?auto=format&fit=crop&w=800&q=80",
    "streetfood_1": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80",
    "streetfood_2": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
    "dosa_indian": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80",
    "indian_curry": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80",
    "rooftop": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80",
    "buffet": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
    "canteen": "https://images.unsplash.com/photo-1567521464027-f127ff144326?auto=format&fit=crop&w=800&q=80",
    "bistro": "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80",
    "dining_lounge": "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80",
    "hotel_dining": "https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=800&q=80",
    "arabian": "https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=800&q=80",
    "healthy": "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80",
}

def pick_image_for_restaurant(name: str) -> str:
    n = name.lower()
    
    # Specific known chains
    if "kfc" in n:
        return THEME_IMAGES["kfc"]
    if "pizza hut" in n:
        return THEME_IMAGES["pizza_hut"]
    if "pizzaburg" in n:
        return THEME_IMAGES["pizza_1"]
    if "pizza lab" in n:
        return THEME_IMAGES["pizza_2"]
    if "pizza" in n:
        return THEME_IMAGES["pizza_3"]
    if "canteen" in n or "cantn" in n:
        return THEME_IMAGES["canteen"]
    if "rooftop" in n:
        return THEME_IMAGES["rooftop"]
    if "buffet" in n:
        return THEME_IMAGES["buffet"]
    if "waffle" in n:
        return THEME_IMAGES["waffle_1"] if "time" in n else THEME_IMAGES["waffle_2"]
    if "biryani" in n or "biriyani" in n or "kachchi" in n:
        if "hanif" in n:
            return THEME_IMAGES["biryani_1"]
        elif "kachchi" in n:
            return THEME_IMAGES["biryani_2"]
        else:
            return THEME_IMAGES["biryani_3"]
    if "kebab" in n:
        return THEME_IMAGES["kebab"]
    if "sweet" in n or "mishtanno" in n or "chand" in n:
        return THEME_IMAGES["sweets_1"] if "bikrampur" in n or "muslim" in n else THEME_IMAGES["sweets_2"]
    if "cake" in n or "bakery" in n or "treat" in n:
        return THEME_IMAGES["bakery_1"] if "cake" in n else THEME_IMAGES["bakery_2"]
    if "burger" in n:
        if "box" in n:
            return THEME_IMAGES["burger_1"]
        elif "house" in n:
            return THEME_IMAGES["burger_2"]
        else:
            return THEME_IMAGES["burger_3"]
    if "chicken" in n:
        return THEME_IMAGES["chicken"]
    if "dosa" in n:
        return THEME_IMAGES["dosa_indian"]
    if "chinese" in n:
        return THEME_IMAGES["chinese_1"]
    if "momo" in n:
        return THEME_IMAGES["momo"]
    if "chatpoti" in n or "pitha" in n:
        return THEME_IMAGES["streetfood_1"]
    if "tiffin" in n or "edibowl" in n:
        return THEME_IMAGES["streetfood_2"]
    if "cha" in n or "tea" in n or "adda" in n:
        return THEME_IMAGES["tea_1"] if "adda" in n else THEME_IMAGES["tea_2"]
    if "cafe" in n or "coffee" in n or "cup" in n:
        if "crimson" in n:
            return THEME_IMAGES["cafe_1"]
        elif "boomers" in n:
            return THEME_IMAGES["cafe_2"]
        elif "n15" in n:
            return THEME_IMAGES["cafe_3"]
        else:
            return THEME_IMAGES["cafe_4"]
    if "indian" in n:
        return THEME_IMAGES["indian_curry"]
    if "arabian" in n:
        return THEME_IMAGES["arabian"]
    if "bistro" in n:
        return THEME_IMAGES["bistro"]
    if "hotel" in n:
        return THEME_IMAGES["hotel_dining"]
    if "dine" in n or "lounge" in n:
        return THEME_IMAGES["dining_lounge"]
    if "healthy" in n or "bowl" in n:
        return THEME_IMAGES["healthy"]
    
    # Default high-end dining ambiance
    return THEME_IMAGES["dining_lounge"]

def main():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT restaurant_id, name, picture_url FROM restaurant ORDER BY name;")
            restaurants = cur.fetchall()
            print(f"Total restaurants found: {len(restaurants)}")
            
            updated_count = 0
            for r in restaurants:
                img_url = pick_image_for_restaurant(r['name'])
                cur.execute(
                    "UPDATE restaurant SET picture_url = %s WHERE restaurant_id = %s;",
                    (img_url, r['restaurant_id'])
                )
                updated_count += 1
            
            conn.commit()
            print(f"Successfully populated picture_url for {updated_count} restaurants!")

if __name__ == "__main__":
    main()
