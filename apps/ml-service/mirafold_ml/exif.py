"""Extraction de la date de prise de vue et coordonnées GPS depuis EXIF."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional

from PIL import Image, ExifTags

_DATETIME_TAGS = (
    "DateTimeOriginal",
    "DateTimeDigitized",
    "DateTime",
)

_TAG_TO_ID = {v: k for k, v in ExifTags.TAGS.items()}
_GPS_TAG_TO_ID = {v: k for k, v in ExifTags.GPSTAGS.items()}


def extract_taken_at(path: str | Path) -> Optional[str]:
    """Retourne une date ISO 8601 ou None."""
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            if not exif:
                return _fallback_mtime(path)
            ifd = exif.get_ifd(ExifTags.IFD.Exif) or {}
            merged = {**exif, **ifd}
            for tag in _DATETIME_TAGS:
                tag_id = _TAG_TO_ID.get(tag)
                if tag_id is None:
                    continue
                raw = merged.get(tag_id)
                if not raw:
                    continue
                parsed = _parse_exif_dt(raw)
                if parsed is not None:
                    return parsed.isoformat()
    except Exception:
        pass
    return _fallback_mtime(path)


def _parse_exif_dt(raw: str) -> Optional[datetime]:
    raw = str(raw).strip()
    formats = ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y:%m:%d")
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def _fallback_mtime(path: str | Path) -> Optional[str]:
    try:
        ts = Path(path).stat().st_mtime
        return datetime.fromtimestamp(ts).isoformat()
    except OSError:
        return None


def _dms_to_decimal(dms, ref: str) -> Optional[float]:
    try:
        d, m, s = [float(x) for x in dms]
    except (TypeError, ValueError):
        return None
    decimal = d + (m / 60.0) + (s / 3600.0)
    if ref in ("S", "W"):
        decimal = -decimal
    return decimal


def extract_camera(path: str | Path) -> tuple[Optional[str], Optional[str]]:
    """Retourne (make, model) depuis EXIF, ou (None, None)."""
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            if not exif:
                return (None, None)
            make = exif.get(_TAG_TO_ID.get("Make", -1))
            model = exif.get(_TAG_TO_ID.get("Model", -1))
            make_s = str(make).strip().strip("\x00") if make else None
            model_s = str(model).strip().strip("\x00") if model else None
            # Si Model commence déjà par Make, on n'inclut Make qu'une fois
            if model_s and make_s and model_s.lower().startswith(make_s.lower()):
                pass  # garder tel quel
            return (make_s or None, model_s or None)
    except Exception:
        return (None, None)


def extract_gps(path: str | Path) -> Optional[tuple[float, float]]:
    """Retourne (latitude, longitude) en degrés décimaux, ou None."""
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            if not exif:
                return None
            gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
            if not gps_ifd:
                return None
            lat = gps_ifd.get(_GPS_TAG_TO_ID.get("GPSLatitude"))
            lat_ref = gps_ifd.get(_GPS_TAG_TO_ID.get("GPSLatitudeRef"))
            lon = gps_ifd.get(_GPS_TAG_TO_ID.get("GPSLongitude"))
            lon_ref = gps_ifd.get(_GPS_TAG_TO_ID.get("GPSLongitudeRef"))
            if lat is None or lon is None or lat_ref is None or lon_ref is None:
                return None
            lat_d = _dms_to_decimal(lat, str(lat_ref).strip())
            lon_d = _dms_to_decimal(lon, str(lon_ref).strip())
            if lat_d is None or lon_d is None:
                return None
            if not (-90 <= lat_d <= 90 and -180 <= lon_d <= 180):
                return None
            return (lat_d, lon_d)
    except Exception:
        return None
