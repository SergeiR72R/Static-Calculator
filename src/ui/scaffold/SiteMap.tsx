import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface SiteMapProps {
  lat: number;
  lon: number;
  /** marker dragged or map clicked */
  onMove: (lat: number, lon: number) => void;
}

const pin = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;margin:-22px 0 0 -11px;background:#e11d48;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [0, 0],
});

/** OpenStreetMap with a draggable marker for confirming the site (Leaflet, loaded on demand). */
export default function SiteMap({ lat, lon, onMove }: SiteMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef(onMove);
  cb.current = onMove;

  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, { zoomControl: true, attributionControl: true }).setView([lat, lon], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    const mk = L.marker([lat, lon], { draggable: true, icon: pin }).addTo(m);
    mk.on('dragend', () => {
      const p = mk.getLatLng();
      cb.current(p.lat, p.lng);
    });
    m.on('click', (e: L.LeafletMouseEvent) => {
      mk.setLatLng(e.latlng);
      cb.current(e.latlng.lat, e.latlng.lng);
    });
    map.current = m;
    marker.current = mk;
    // the dialog animates in: measure again when it has its size
    const t = setTimeout(() => m.invalidateSize(), 200);
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a new search result: move the view and the marker
  useEffect(() => {
    const m = map.current;
    const mk = marker.current;
    if (!m || !mk) return;
    const cur = mk.getLatLng();
    if (Math.abs(cur.lat - lat) < 1e-9 && Math.abs(cur.lng - lon) < 1e-9) return;
    mk.setLatLng([lat, lon]);
    m.setView([lat, lon], Math.max(m.getZoom(), 12));
  }, [lat, lon]);

  return <div ref={host} className="h-72 w-full overflow-hidden rounded-md border border-slate-300 dark:border-slate-700" data-testid="site-map" dir="ltr" />;
}
