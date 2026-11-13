import math

# Main KNMI automatic weather stations with long daily records (approximate coordinates).
KNMI_STATIONS = {
    215: ("Voorschoten", 52.141, 4.437),
    240: ("Schiphol", 52.318, 4.790),
    260: ("De Bilt", 52.100, 5.180),
    270: ("Leeuwarden", 53.224, 5.752),
    275: ("Deelen", 52.056, 5.873),
    280: ("Eelde", 53.125, 6.585),
    290: ("Twenthe", 52.274, 6.891),
    310: ("Vlissingen", 51.442, 3.596),
    344: ("Rotterdam", 51.962, 4.447),
    350: ("Gilze-Rijen", 51.566, 4.936),
    370: ("Eindhoven", 51.451, 5.377),
    380: ("Maastricht", 50.906, 5.762),
}


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearest_knmi(lat, lon):
    stn = min(KNMI_STATIONS, key=lambda s: haversine_km(lat, lon, KNMI_STATIONS[s][1], KNMI_STATIONS[s][2]))
    name, slat, slon = KNMI_STATIONS[stn]
    return stn, name, round(haversine_km(lat, lon, slat, slon), 1)
