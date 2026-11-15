"""Turn a GPX file into a `track` value for data/updates.csv.

    python tools/gpx_to_track.py my-drive.gpx

Prints a Google "encoded polyline". It keeps only coordinates (no times, names or device info),
cuts 1 km off each end so a home or campsite never shows, and simplifies the line.
Do the same as the Google Form route does in google/intake.gs, so both give the same result.

To make a whole new road from a GPX instead, copy the file into data/tracks/, add the road to
data/roads-src.json with "gpx": "tracks/<file>.gpx", and run tools/build_roads.py.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_roads import haversine_km, read_gpx, simplify  # noqa: E402

TRIM_KM = 1
MIN_KM = 3
TOLERANCE = 0.0002


def trim_ends(pts, km):
    def cut(arr):
        d, i = 0.0, 1
        while i < len(arr) and d < km:
            d += haversine_km((arr[i - 1][1], arr[i - 1][0]), (arr[i][1], arr[i][0]))
            i += 1
        return arr[i - 1:]
    return cut(cut(pts)[::-1])[::-1]


def encode(points_lonlat):
    out, plat, plon = [], 0, 0
    for lon, lat in points_lonlat:
        a, b = round(lat * 1e5), round(lon * 1e5)
        for v in (a - plat, b - plon):
            v = ~(v << 1) if v < 0 else v << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        plat, plon = a, b
    return "".join(out)


def main(path):
    coords, _ = read_gpx(path)             # [lon, lat]
    coords = trim_ends(coords, TRIM_KM)
    km = sum(haversine_km((a[1], a[0]), (b[1], b[0])) for a, b in zip(coords, coords[1:]))
    if km < MIN_KM:
        sys.exit(f"Track is only {km:.1f} km after trimming; too short to publish.")
    line = simplify(coords, TOLERANCE)
    print(encode(line))
    print(f"({km:.0f} km, {len(line)} points)", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
