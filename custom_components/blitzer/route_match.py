"""Which reports lie on a route, rather than merely near it.

A route is searched box by box, and a box a few hundred metres wide around a
road through a city holds every parallel street and every crossing. On the
first real route, Munich to Poing, 8 of 18 reports were between 290 and 800 m
off the road - Prinzregentenstraße, Rosenheimer Straße - and there was nothing
at all between 80 and 290 m. So the boxes stay, as the search for candidates,
and a report is kept only when it comes within a small distance of the route
line itself.

Everything here is plain geometry on a flat projection around the route's
mean latitude: exact enough for tens of metres over tens of kilometres, and
free of anything Home Assistant, so it can be checked on its own.
"""

from __future__ import annotations

from math import cos, hypot, radians

_METERS_PER_DEGREE = 111320.0

# The type code of a tailback ("Stauende"). Blitzer.de reports one as its
# position plus an end point; which way the queued traffic flows between the
# two is settled by JAM_FLOWS_TO_END.
TYPE_TAILBACK = "20"

# Queued traffic flows from a tailback's reported position towards its end
# point. Blitzer.de says so nowhere - its own map never reads the end point -
# so it was measured: routed along three real motorway queues in both
# directions, from the point to the end was the direct way every time (A3
# 1.3 km against 23.7 km, A8 2.3 against 6.6, A9 1.4 against 47.7), the other
# way round a detour to the next junction and back. Both ends lie on the
# queued carriageway, so only that carriageway's own direction is direct.
JAM_FLOWS_TO_END = True

# How far a line report may cross the route and still count as on it. A
# tailback on a road that merely crosses the route touches it at one spot;
# one on the route's own road, or merging into it, runs alongside. Beyond 60
# degrees the two are treated as crossing.
_MAX_CROSSING_COS = 0.5


def decode_polyline(encoded: str, precision: int = 5) -> list[tuple[float, float]]:
    """Google's encoded polyline format, as Blitzer.de sends roadworks in.

    Precision 5 is what it uses: decoded that way, the line of every one of
    121 roadworks sampled started at the report's position and ended exactly
    at its "lat_end"/"lng_end".
    """
    factor = 10 ** precision
    points: list[tuple[float, float]] = []
    index = lat = lon = 0
    length = len(encoded)
    while index < length:
        deltas = []
        for _ in range(2):
            shift = result = 0
            while True:
                if index >= length:
                    raise ValueError("truncated polyline")
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lon += deltas[1]
        points.append((lat / factor, lon / factor))
    return points


def _point_segment(px, py, ax, ay, bx, by) -> tuple[float, float]:
    """Distance from p to the segment a-b, and how far along it the nearest point lies (0-1)."""
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = ((px - ax) * dx + (py - ay) * dy) / length2 if length2 else 0.0
    t = max(0.0, min(1.0, t))
    return hypot(px - ax - t * dx, py - ay - t * dy), t


def _segments_cross(a, b, c, d) -> bool:
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    o1, o2 = orient(a, b, c), orient(a, b, d)
    o3, o4 = orient(c, d, a), orient(c, d, b)
    return (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0)


# The grid the route's segments are filed in, in metres. A route from Munich
# to Frankfurt is some 780 segments after thinning, and every poll along it
# brings thousands of candidates from boxes 10 km wide - measured against
# every segment each, that was 8.9 s in the event loop. Filed by cell, a
# candidate is measured against the handful of segments near it. 500 m: a few
# cells around any candidate hold what matters, and a long straight segment
# is still filed in only a few dozen.
_CELL_M = 500.0


class RouteLine:
    """A route as a line, measured in metres."""

    def __init__(self, points: list[tuple[float, float]]) -> None:
        if not points:
            raise ValueError("a route needs points")
        lat0 = sum(p[0] for p in points) / len(points)
        self._k = cos(radians(lat0))
        self._xy = [self._project(p) for p in points]
        # Distance along the route at each of its points, for telling which
        # of two positions on it comes first.
        self._along = [0.0]
        for (ax, ay), (bx, by) in zip(self._xy, self._xy[1:]):
            self._along.append(self._along[-1] + hypot(bx - ax, by - ay))
        # Every segment filed under each grid cell its bounding box touches.
        self._cells: dict[tuple[int, int], list[int]] = {}
        for i, ((ax, ay), (bx, by)) in enumerate(zip(self._xy, self._xy[1:])):
            for cell in self._cells_over(min(ax, bx), min(ay, by), max(ax, bx), max(ay, by)):
                self._cells.setdefault(cell, []).append(i)
        xs = [x for x, _ in self._xy]
        ys = [y for _, y in self._xy]
        self._extent = (
            int(min(xs) // _CELL_M), int(min(ys) // _CELL_M),
            int(max(xs) // _CELL_M), int(max(ys) // _CELL_M),
        )

    def _project(self, point: tuple[float, float]) -> tuple[float, float]:
        return (point[1] * _METERS_PER_DEGREE * self._k, point[0] * _METERS_PER_DEGREE)

    @staticmethod
    def _cells_over(x0, y0, x1, y1):
        for cx in range(int(x0 // _CELL_M), int(x1 // _CELL_M) + 1):
            for cy in range(int(y0 // _CELL_M), int(y1 // _CELL_M) + 1):
                yield (cx, cy)

    def _segments_near(self, x0, y0, x1, y1) -> set[int]:
        """The segments filed in any cell the box x0,y0-x1,y1 touches."""
        found: set[int] = set()
        for cell in self._cells_over(x0, y0, x1, y1):
            found.update(self._cells.get(cell, ()))
        return found

    def _measure(self, px, py, i) -> tuple[float, float, int]:
        (ax, ay), (bx, by) = self._xy[i], self._xy[i + 1]
        dist, t = _point_segment(px, py, ax, ay, bx, by)
        return dist, self._along[i] + t * (self._along[i + 1] - self._along[i]), i

    def nearest(self, point: tuple[float, float], within: float | None = None) -> tuple[float, float, int]:
        """Distance to the route, distance along it to that nearest spot, and
        the index of the route segment it is on.

        With `within`, only the cells that many metres around the point are
        looked at, and a route further away than that is reported as
        infinitely far - all a caller comparing against a tolerance needs.
        Without it the answer is exact whatever the distance: the cells are
        searched ring by ring around the point, and the search stops once
        everything not yet seen must lie further away than the nearest
        segment already found.
        """
        px, py = self._project(point)
        if len(self._xy) == 1:
            ax, ay = self._xy[0]
            return hypot(px - ax, py - ay), 0.0, 0
        if within is not None:
            best = (float("inf"), 0.0, 0)
            for i in self._segments_near(px - within, py - within, px + within, py + within):
                measured = self._measure(px, py, i)
                if measured[0] < best[0]:
                    best = measured
            return best
        cx, cy = int(px // _CELL_M), int(py // _CELL_M)
        x_lo, y_lo, x_hi, y_hi = self._extent
        last_ring = max(abs(cx - x_lo), abs(cx - x_hi), abs(cy - y_lo), abs(cy - y_hi))
        best = (float("inf"), 0.0, 0)
        seen: set[int] = set()
        ring = 0
        while ring <= last_ring:
            for dx in range(-ring, ring + 1):
                dys = (-ring, ring) if abs(dx) != ring else range(-ring, ring + 1)
                for dy in dys:
                    for i in self._cells.get((cx + dx, cy + dy), ()):
                        if i in seen:
                            continue
                        seen.add(i)
                        measured = self._measure(px, py, i)
                        if measured[0] < best[0]:
                            best = measured
            # Whatever is still unseen sits wholly in rings further out, and
            # so at least `ring` whole cells away.
            if ring * _CELL_M >= best[0]:
                break
            ring += 1
        return best

    def distance_to_line(self, line: list[tuple[float, float]], within: float | None = None) -> float:
        """The smallest distance between another line and the route.

        With `within`, only route segments that come within that many metres
        of the line's bounding box are measured, and anything further away
        is reported as infinite - which is all a caller comparing against a
        tolerance needs to know.
        """
        other = [self._project(p) for p in line]
        best = float("inf")
        for c, d in zip(other, other[1:]):
            if within is None:
                near = range(len(self._xy) - 1)
            else:
                near = self._segments_near(
                    min(c[0], d[0]) - within, min(c[1], d[1]) - within,
                    max(c[0], d[0]) + within, max(c[1], d[1]) + within,
                )
            for i in near:
                a, b = self._xy[i], self._xy[i + 1]
                if _segments_cross(a, b, c, d):
                    return 0.0
                best = min(
                    best,
                    _point_segment(c[0], c[1], a[0], a[1], b[0], b[1])[0],
                    _point_segment(d[0], d[1], a[0], a[1], b[0], b[1])[0],
                    _point_segment(a[0], a[1], c[0], c[1], d[0], d[1])[0],
                    _point_segment(b[0], b[1], c[0], c[1], d[0], d[1])[0],
                )
        return best

    def heading_cos(self, segment: int, a: tuple[float, float], b: tuple[float, float]) -> float:
        """The cosine of the angle between route segment `segment` and a-b."""
        (sx, sy), (ex, ey) = self._xy[segment], self._xy[min(segment + 1, len(self._xy) - 1)]
        ax, ay = self._project(a)
        bx, by = self._project(b)
        rx, ry, jx, jy = ex - sx, ey - sy, bx - ax, by - ay
        norm = hypot(rx, ry) * hypot(jx, jy)
        return (rx * jx + ry * jy) / norm if norm else 0.0


def report_geometry(item: dict, info: dict) -> list[tuple[float, float]]:
    """Where a report lies: its own line, the stretch to its end point, or a point."""
    polyline = item.get("polyline")
    if isinstance(polyline, str) and len(polyline) > 5:
        try:
            line = decode_polyline(polyline)
        except ValueError:
            line = []
        if len(line) >= 2:
            return line
    point = (float(item["lat"]), float(item["lng"]))
    try:
        end = (float(info.get("lat_end")), float(info.get("lng_end")))
    except (TypeError, ValueError):
        return [point]
    return [point, end] if end != point else [point]


def on_route(route: RouteLine, item: dict, info: dict, tolerance: float) -> bool:
    """Whether a report lies on the route, within `tolerance` metres of it.

    A point report is measured from its position. A report with a length -
    roadworks with a line, a tailback with an end point - is measured along
    that length, so a jam whose far end reaches onto the route counts even
    when the point it was reported at does not.

    A tailback must also run the way the route does. On a motorway the other
    carriageway is well inside any useful tolerance, and a jam there is one
    this route never meets.
    """
    geometry = report_geometry(item, info)
    if len(geometry) == 1:
        return route.nearest(geometry[0], within=tolerance)[0] <= tolerance
    if route.distance_to_line(geometry, within=tolerance) > tolerance:
        return False
    if str(item.get("type")) != TYPE_TAILBACK:
        return True
    return _runs_with_route(route, geometry[0], geometry[-1], tolerance)


def _runs_with_route(route: RouteLine, start, end, tolerance: float) -> bool:
    """Whether a jam from `start` to `end` queues the way the route travels."""
    if not JAM_FLOWS_TO_END:
        start, end = end, start
    d_start, along_start, seg_start = route.nearest(start)
    d_end, along_end, seg_end = route.nearest(end)
    if d_start <= tolerance and d_end <= tolerance:
        # Both ends on the route: the order they come in along it settles the
        # direction, however the road bends in between.
        if abs(along_end - along_start) < 1.0:
            return True
        return along_end > along_start
    # Only partly on the route - joining it, leaving it, or crossing it.
    # Compared with the route's own direction where the jam is closest.
    segment = seg_start if d_start <= d_end else seg_end
    cosine = route.heading_cos(segment, start, end)
    return cosine >= _MAX_CROSSING_COS
