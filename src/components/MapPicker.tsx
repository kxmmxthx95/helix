import { useEffect, useRef, useState } from "react";
import { ExpandIcon, X } from "@/components/icons";
import { Field, Input } from "@/components/ui";

export type LatLng = { lat: number; lng: number };

// Just the slice of the Google Maps JS API used here — avoids pulling in @types/google.maps.
type GMap = { setCenter(p: LatLng): void; setZoom(z: number): void; addListener(e: string, cb: (ev: { latLng: { lat(): number; lng(): number } }) => void): void };
type GMarker = { setPosition(p: LatLng | null): void; setMap(m: GMap | null): void; addListener(e: string, cb: () => void): void; getPosition(): { lat(): number; lng(): number } | null };
type GCircle = { setOptions(o: { center?: LatLng; radius?: number; map?: GMap | null }): void };
type GMaps = { Map: new (el: HTMLElement, o: object) => GMap; Marker: new (o: object) => GMarker; Circle: new (o: object) => GCircle };

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const BANGKOK: LatLng = { lat: 13.7563, lng: 100.5018 };

let loading: Promise<GMaps> | null = null;
function loadGoogleMaps(key: string): Promise<GMaps> {
  const w = window as unknown as { google?: { maps?: GMaps }; __gmapsReady?: () => void };
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  loading ??= new Promise((resolve, reject) => {
    w.__gmapsReady = () => resolve(w.google!.maps!);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=__gmapsReady`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("โหลด Google Maps ไม่สำเร็จ"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Accepts "13.7563, 100.5018" — the format Google Maps copies on right-click. */
export function parseLatLng(text: string): LatLng | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

const fmt = (p: LatLng | null) => (p ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` : "");

/**
 * Pick a location by clicking / dragging a marker on Google Maps, or type / paste "lat, lng".
 * Without VITE_GOOGLE_MAPS_API_KEY the map is skipped and only the text field is shown.
 */
export function MapPicker({
  value,
  onChange,
  disabled,
  radius,
}: {
  value: LatLng | null;
  onChange: (p: LatLng | null) => void;
  disabled?: boolean;
  /** Metres; draws a circle around the marker. */
  radius?: number | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<GMap | null>(null);
  const marker = useRef<GMarker | null>(null);
  const circle = useRef<GCircle | null>(null);
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [text, setText] = useState(fmt(value));
  const [error, setError] = useState<string | null>(null);
  const [big, setBig] = useState(false);

  // Keep the text in step with map clicks / external changes.
  useEffect(() => setText(fmt(value)), [value]);

  useEffect(() => {
    if (!API_KEY || !el.current) return;
    let cancelled = false;
    loadGoogleMaps(API_KEY).then(
      (maps) => {
        if (cancelled || !el.current) return;
        map.current = new maps.Map(el.current, {
          center: value ?? BANGKOK,
          zoom: value ? 16 : 6,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        });
        marker.current = new maps.Marker({ map: map.current, position: value, draggable: !disabled });
        circle.current = new maps.Circle({
          map: map.current,
          center: value ?? BANGKOK,
          radius: radiusRef.current ?? 0,
          clickable: false,
          strokeWeight: 1,
          fillOpacity: 0.15,
        });
        circle.current.setOptions({ map: value && radiusRef.current ? map.current : null });
        if (disabled) return;
        const set = (lat: number, lng: number) => onChangeRef.current({ lat, lng });
        map.current.addListener("click", (e) => set(e.latLng.lat(), e.latLng.lng()));
        marker.current.addListener("dragend", () => {
          const p = marker.current?.getPosition();
          if (p) set(p.lat(), p.lng());
        });
      },
      (e: Error) => setError(e.message),
    );
    return () => {
      cancelled = true;
    };
    // The map is created once; later value changes are pushed in by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    marker.current?.setPosition(value);
    if (value) {
      map.current?.setCenter(value);
      map.current?.setZoom(16);
    }
  }, [value]);

  useEffect(() => {
    circle.current?.setOptions({
      center: value ?? undefined,
      radius: radius ?? 0,
      map: value && radius ? map.current : null,
    });
  }, [value, radius]);

  function commit() {
    if (!text.trim()) return onChange(null);
    const p = parseLatLng(text);
    if (p) onChange(p);
    else setText(fmt(value)); // unparseable → revert
  }

  return (
    <>
      {API_KEY ? (
        <div className={big ? "fixed inset-0 z-50 bg-background !p-0" : "relative !p-2"}>
          <div ref={el} className={big ? "h-full w-full bg-secondary" : "h-56 w-full overflow-hidden rounded-lg bg-secondary"} />
          <button
            type="button"
            onClick={() => setBig(!big)}
            aria-label={big ? "ปิดแผนที่ขนาดเต็ม" : "ขยายแผนที่"}
            className={`tappable absolute flex size-9 items-center justify-center rounded-full bg-background text-foreground shadow-md ${big ? "right-3 top-3" : "right-4 top-4"}`}
          >
            {big ? <X className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
          </button>
          {error && <p className="px-4 py-2 text-xs text-destructive">{error}</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">ตั้งค่า VITE_GOOGLE_MAPS_API_KEY เพื่อเลือกจากแผนที่ — ตอนนี้กรอกพิกัดเองได้</p>
      )}
      <Field label="พิกัด">
        <Input
          value={text}
          disabled={disabled}
          placeholder="ละติจูด, ลองจิจูด"
          inputMode="decimal"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />
      </Field>
      {value && (
        <a
          href={`https://www.google.com/maps?q=${value.lat},${value.lng}`}
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-accent"
        >
          เปิดใน Google Maps
        </a>
      )}
    </>
  );
}
