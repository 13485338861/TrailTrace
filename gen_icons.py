"""Generate TrailTrace launcher icons and splash screens for all Android densities."""
from PIL import Image, ImageDraw, ImageFont
import os
import math

BASE_DIR = r"C:\Users\Admin\.qclaw\workspace-agent-8b13c56f\app\android\app\src\main\res"

# Icon sizes for each density
ICON_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# Splash sizes (portrait)
SPLASH_SIZES = {
    "drawable-port-mdpi": (480, 800),
    "drawable-port-hdpi": (720, 1280),
    "drawable-port-xhdpi": (960, 1600),
    "drawable-port-xxhdpi": (1440, 2560),
    "drawable-port-xxxhdpi": (1920, 3200),
}

# Landscape splash
SPLASH_LAND_SIZES = {
    "drawable-land-mdpi": (800, 480),
    "drawable-land-hdpi": (1280, 720),
    "drawable-land-xhdpi": (1600, 960),
    "drawable-land-xxhdpi": (2560, 1440),
    "drawable-land-xxxhdpi": (3200, 1920),
}

# Colors
BG_DARK = (15, 23, 42)       # #0f172a
BG_SURFACE = (30, 41, 59)     # #1e293b
PRIMARY = (16, 185, 129)      # #10b981
WHITE = (241, 245, 249)       # #f1f5f9
ACCENT = (245, 158, 11)       # #f59e0b


def create_icon(size: int) -> Image.Image:
    """Create a launcher icon with mountain + trail line."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background circle
    margin = int(size * 0.05)
    draw.ellipse([margin, margin, size - margin, size - margin], fill=BG_DARK)

    # Mountain triangle
    cx, cy = size / 2, size / 2
    mountain_h = size * 0.35
    mountain_w = size * 0.5
    
    # Main peak
    peak_x, peak_y = cx, cy - mountain_h * 0.6
    left_x, left_y = cx - mountain_w / 2, cy + mountain_h * 0.3
    right_x, right_y = cx + mountain_w / 2, cy + mountain_h * 0.3
    
    # Draw mountain body
    mountain_points = [
        (peak_x, peak_y),
        (left_x, left_y),
        (right_x, right_y),
    ]
    draw.polygon(mountain_points, fill=BG_SURFACE)
    
    # Snow cap (small triangle at top)
    cap_h = mountain_h * 0.25
    cap_w = mountain_w * 0.2
    cap_points = [
        (peak_x, peak_y),
        (peak_x - cap_w, peak_y + cap_h),
        (peak_x + cap_w, peak_y + cap_h),
    ]
    draw.polygon(cap_points, fill=WHITE)
    
    # Secondary smaller peak
    s_peak_x = cx + mountain_w * 0.25
    s_peak_y = cy - mountain_h * 0.2
    s_left_x = cx + mountain_w * 0.05
    s_right_x = cx + mountain_w * 0.45
    
    draw.polygon([
        (s_peak_x, s_peak_y),
        (s_left_x, left_y),
        (s_right_x, left_y),
    ], fill=(51, 65, 85))  # surface2
    
    # Trail line (sinuous path going up the mountain)
    trail_start_y = left_y + size * 0.02
    trail_points = []
    steps = 30
    for i in range(steps + 1):
        t = i / steps
        y = trail_start_y - t * (trail_start_y - peak_y - cap_h)
        # Sinusoidal x offset
        x = cx + math.sin(t * math.pi * 3) * size * 0.08 - size * 0.05
        trail_points.append((x, y))
    
    # Draw trail with thickness
    line_w = max(2, int(size * 0.02))
    for i in range(len(trail_points) - 1):
        draw.line([trail_points[i], trail_points[i + 1]], fill=PRIMARY, width=line_w)
    
    # Location dot at the peak of the trail
    dot_r = max(3, int(size * 0.025))
    dot_x, dot_y = trail_points[-1]
    draw.ellipse([dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r], fill=PRIMARY)
    # White border for dot
    draw.ellipse([dot_x - dot_r - 1, dot_y - dot_r - 1, dot_x + dot_r + 1, dot_y + dot_r + 1], outline=WHITE, width=max(1, int(size * 0.008)))
    
    return img


def create_foreground_icon(size: int) -> Image.Image:
    """Create adaptive icon foreground (no background, just the logo)."""
    # Adaptive icon foreground needs safe zone (inner 72% of 108dp)
    # For a 108x108 canvas, content is in 72x72 center
    canvas_size = size
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Scale down and center the icon design
    # The content area is 66.6% of the canvas (72/108)
    content_size = int(canvas_size * 0.666)
    offset = (canvas_size - content_size) // 2
    
    # Create the icon at content size, then paste
    icon = create_icon(content_size)
    # Make it transparent background
    icon_bg = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    # Redraw without the background circle
    draw_icon = ImageDraw.Draw(icon_bg)
    
    cx, cy = content_size / 2, content_size / 2
    mountain_h = content_size * 0.35
    mountain_w = content_size * 0.5
    
    peak_x, peak_y = cx, cy - mountain_h * 0.6
    left_x, left_y = cx - mountain_w / 2, cy + mountain_h * 0.3
    right_x, right_y = cx + mountain_w / 2, cy + mountain_h * 0.3
    
    draw_icon.polygon([(peak_x, peak_y), (left_x, left_y), (right_x, right_y)], fill=BG_SURFACE)
    
    cap_h = mountain_h * 0.25
    cap_w = mountain_w * 0.2
    draw_icon.polygon([
        (peak_x, peak_y),
        (peak_x - cap_w, peak_y + cap_h),
        (peak_x + cap_w, peak_y + cap_h),
    ], fill=WHITE)
    
    s_peak_x = cx + mountain_w * 0.25
    s_peak_y = cy - mountain_h * 0.2
    draw_icon.polygon([
        (s_peak_x, s_peak_y),
        (cx + mountain_w * 0.05, left_y),
        (cx + mountain_w * 0.45, left_y),
    ], fill=(51, 65, 85))
    
    trail_start_y = left_y + content_size * 0.02
    trail_points = []
    steps = 30
    for i in range(steps + 1):
        t = i / steps
        y = trail_start_y - t * (trail_start_y - peak_y - cap_h)
        x = cx + math.sin(t * math.pi * 3) * content_size * 0.08 - content_size * 0.05
        trail_points.append((x, y))
    
    line_w = max(2, int(content_size * 0.02))
    for i in range(len(trail_points) - 1):
        draw_icon.line([trail_points[i], trail_points[i + 1]], fill=PRIMARY, width=line_w)
    
    dot_r = max(3, int(content_size * 0.025))
    dot_x, dot_y = trail_points[-1]
    draw_icon.ellipse([dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r], fill=PRIMARY)
    draw_icon.ellipse([dot_x - dot_r - 1, dot_y - dot_r - 1, dot_x + dot_r + 1, dot_y + dot_r + 1], outline=WHITE, width=max(1, int(content_size * 0.008)))
    
    img.paste(icon_bg, (offset, offset), icon_bg)
    return img


def create_splash(width: int, height: int) -> Image.Image:
    """Create splash screen with centered logo and app name."""
    img = Image.new("RGB", (width, height), BG_DARK)
    draw = ImageDraw.Draw(img)
    
    # Draw the icon in center
    icon_size = min(width, height) // 3
    icon = create_icon(icon_size)
    
    # Paste icon centered, slightly above center
    icon_x = (width - icon_size) // 2
    icon_y = height // 2 - icon_size // 2 - int(height * 0.05)
    
    # Convert icon to RGB for pasting onto RGB splash
    icon_rgb = Image.new("RGB", icon.size, BG_DARK)
    icon_rgb.paste(icon, mask=icon.split()[3] if icon.mode == "RGBA" else None)
    img.paste(icon_rgb, (icon_x, icon_y))
    
    # Draw app name below icon
    font_size = max(16, min(width, height) // 18)
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    text = "TrailTrace"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (width - text_w) // 2
    text_y = icon_y + icon_size + int(height * 0.03)
    draw.text((text_x, text_y), text, fill=WHITE, font=font)
    
    # Subtitle
    sub_font_size = max(10, font_size // 2)
    try:
        sub_font = ImageFont.truetype("arial.ttf", sub_font_size)
    except:
        sub_font = ImageFont.load_default()
    
    sub = "轻迹 · 户外轨迹记录"
    sub_bbox = draw.textbbox((0, 0), sub, font=sub_font)
    sub_w = sub_bbox[2] - sub_bbox[0]
    sub_x = (width - sub_w) // 2
    sub_y = text_y + font_size + int(height * 0.01)
    draw.text((sub_x, sub_y), sub, fill=(100, 116, 139), font=sub_font)  # muted color
    
    return img


def main():
    # Generate launcher icons
    for density, size in ICON_SIZES.items():
        dir_path = os.path.join(BASE_DIR, density)
        os.makedirs(dir_path, exist_ok=True)
        
        icon = create_icon(size)
        icon.save(os.path.join(dir_path, "ic_launcher.png"))
        
        foreground = create_foreground_icon(size)
        foreground.save(os.path.join(dir_path, "ic_launcher_foreground.png"))
        
        # Round icon is same as regular for simplicity
        icon.save(os.path.join(dir_path, "ic_launcher_round.png"))
    
    print("Icons generated for all densities")
    
    # Generate splash screens
    for density, (w, h) in SPLASH_SIZES.items():
        dir_path = os.path.join(BASE_DIR, density)
        os.makedirs(dir_path, exist_ok=True)
        splash = create_splash(w, h)
        splash.save(os.path.join(dir_path, "splash.png"))
    
    for density, (w, h) in SPLASH_LAND_SIZES.items():
        dir_path = os.path.join(BASE_DIR, density)
        os.makedirs(dir_path, exist_ok=True)
        splash = create_splash(w, h)
        splash.save(os.path.join(dir_path, "splash.png"))
    
    print("Splash screens generated for all densities")
    
    # Also update the v24 drawable
    v24_dir = os.path.join(BASE_DIR, "drawable-v24")
    os.makedirs(v24_dir, exist_ok=True)
    # Just copy a large splash there
    splash = create_splash(960, 1600)
    splash.save(os.path.join(v24_dir, "splash.png"))
    
    print("All assets generated!")


if __name__ == "__main__":
    main()
