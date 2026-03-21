"""
Image processing utilities for Alfred
"""
from PIL import Image
from pathlib import Path
from typing import Tuple
import logging

logger = logging.getLogger(__name__)


def optimize_image(image_path: Path, max_size: Tuple[int, int] = (1200, 1200), quality: int = 85) -> bool:
    """
    Optimize an image by resizing and compressing
    
    Args:
        image_path: Path to the image file
        max_size: Maximum dimensions (width, height)
        quality: JPEG quality (1-100)
    
    Returns:
        True if optimization successful, False otherwise
    """
    try:
        with Image.open(image_path) as img:
            # Convert to RGB if necessary
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Resize if too large
            if img.width > max_size[0] or img.height > max_size[1]:
                img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Save optimized
            img.save(image_path, format='JPEG', quality=quality, optimize=True)
            
        return True
        
    except Exception as e:
        logger.error(f"Failed to optimize image {image_path}: {e}")
        return False


def validate_image_type(file_path: Path) -> bool:
    """
    Validate that file is a supported image type
    """
    try:
        with Image.open(file_path) as img:
            return img.format in ['JPEG', 'PNG', 'GIF', 'WEBP']
    except Exception:
        return False