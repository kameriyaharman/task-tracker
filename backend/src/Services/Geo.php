<?php
namespace App\Services;

use App\Core\Db;

final class Geo
{
    /** Distance in metres between two lat/lng points. */
    public static function distance(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
        return 2 * $r * asin(min(1, sqrt($a)));
    }

    /** Returns the geofence row the point falls in (closest first), or null. */
    public static function matchGeofence(int $companyId, float $lat, float $lng): ?array
    {
        $best = null;
        foreach (Db::all('SELECT * FROM geofences WHERE company_id = ?', [$companyId]) as $g) {
            $d = self::distance($lat, $lng, (float) $g['lat'], (float) $g['lng']);
            if ($d <= (int) $g['radius_m'] && ($best === null || $d < $best['distance_m'])) {
                $best = $g + ['distance_m' => round($d)];
            }
        }
        return $best;
    }

    /** Distance from nearest "office" geofence (first one), for "5.4 km from office" labels. */
    public static function fromOffice(int $companyId, float $lat, float $lng): ?float
    {
        $g = Db::one('SELECT lat, lng FROM geofences WHERE company_id = ? ORDER BY id LIMIT 1', [$companyId]);
        return $g ? self::distance($lat, $lng, (float) $g['lat'], (float) $g['lng']) : null;
    }
}
