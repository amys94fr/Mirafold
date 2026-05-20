"""Reverse geocoding offline via reverse_geocoder + pycountry pour les noms en français."""
from __future__ import annotations

from typing import Iterable, Optional

_FR_COUNTRY_OVERRIDES = {
    "FR": "France", "US": "États-Unis", "GB": "Royaume-Uni", "DE": "Allemagne",
    "ES": "Espagne", "IT": "Italie", "PT": "Portugal", "BE": "Belgique",
    "NL": "Pays-Bas", "CH": "Suisse", "AT": "Autriche", "IE": "Irlande",
    "CA": "Canada", "MX": "Mexique", "BR": "Brésil", "AR": "Argentine",
    "CN": "Chine", "JP": "Japon", "KR": "Corée du Sud", "IN": "Inde",
    "RU": "Russie", "UA": "Ukraine", "PL": "Pologne", "CZ": "Tchéquie",
    "GR": "Grèce", "TR": "Turquie", "EG": "Égypte", "MA": "Maroc",
    "DZ": "Algérie", "TN": "Tunisie", "SN": "Sénégal", "CI": "Côte d'Ivoire",
    "ZA": "Afrique du Sud", "NG": "Nigéria", "KE": "Kenya", "ET": "Éthiopie",
    "AU": "Australie", "NZ": "Nouvelle-Zélande", "IL": "Israël", "SA": "Arabie saoudite",
    "AE": "Émirats arabes unis", "PS": "Palestine", "TH": "Thaïlande", "VN": "Vietnam", "ID": "Indonésie",
    "MY": "Malaisie", "PH": "Philippines", "SG": "Singapour", "TW": "Taïwan",
    "HK": "Hong Kong", "SE": "Suède", "NO": "Norvège", "FI": "Finlande",
    "DK": "Danemark", "IS": "Islande", "HU": "Hongrie", "RO": "Roumanie",
    "BG": "Bulgarie", "HR": "Croatie", "SK": "Slovaquie", "SI": "Slovénie",
}


def _country_name(cc: str) -> str:
    if cc in _FR_COUNTRY_OVERRIDES:
        return _FR_COUNTRY_OVERRIDES[cc]
    try:
        import pycountry

        c = pycountry.countries.get(alpha_2=cc)
        if c is not None:
            return getattr(c, "common_name", None) or c.name
    except Exception:
        pass
    return cc


def reverse_batch(
    coords: Iterable[tuple[float, float]],
) -> list[Optional[tuple[str, str]]]:
    """Reverse-geocode un batch de (lat, lon). Retourne liste de (city, country) ou None."""
    coords_list = list(coords)
    if not coords_list:
        return []
    try:
        import reverse_geocoder as rg
    except Exception:
        return [None] * len(coords_list)
    results = rg.search(coords_list, mode=1, verbose=False)
    out: list[Optional[tuple[str, str]]] = []
    for r in results:
        try:
            city = str(r.get("name", "")).strip()
            cc = str(r.get("cc", "")).strip()
            if not city or not cc:
                out.append(None)
            else:
                out.append((city, _country_name(cc)))
        except Exception:
            out.append(None)
    return out
