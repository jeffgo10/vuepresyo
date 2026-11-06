export type GeoLocationResult = {
  lat: number;
  lng: number;
  label: string | null;
};

export async function getCurrentCoordinates(): Promise<GeoLocationResult | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let label: string | null = null;

        // Attempt a reverse-geocoding label when online
        if (typeof navigator !== "undefined" && navigator.onLine) {
          try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
            const res = await fetch(url, {
              headers: { "Accept-Language": "en" },
              signal: AbortSignal.timeout(4000),
            });
            if (res.ok) {
              const data = (await res.json()) as {
                name?: string;
                address?: {
                  shop?: string;
                  supermarket?: string;
                  mall?: string;
                  commercial?: string;
                  suburb?: string;
                  city?: string;
                  town?: string;
                };
              };
              const storeOrPlace =
                data.address?.supermarket ||
                data.address?.shop ||
                data.address?.mall ||
                data.address?.commercial ||
                data.name;
              const city = data.address?.city || data.address?.town || data.address?.suburb;
              if (storeOrPlace && city) {
                label = `${storeOrPlace}, ${city}`;
              } else if (storeOrPlace) {
                label = storeOrPlace;
              } else if (city) {
                label = city;
              }
            }
          } catch {
            // Reverse geocode failed or timed out; fall back to coords
          }
        }

        resolve({ lat, lng, label });
      },
      () => {
        // Geolocation denied, unavailable, or timed out
        resolve(null);
      },
      { timeout: 8000, maximumAge: 60000, enableHighAccuracy: false },
    );
  });
}
