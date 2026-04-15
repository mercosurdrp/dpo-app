"use client"

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { FoxtrotDriverLocation } from "@/types/database"

const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

interface Props {
  driverLocations: FoxtrotDriverLocation[]
}

export default function FoxtrotMap({ driverLocations }: Props) {
  const center: [number, number] =
    driverLocations.length > 0
      ? [driverLocations[0].latitud, driverLocations[0].longitud]
      : [-33.5, -60.1]

  return (
    <div className="h-[500px] w-full overflow-hidden rounded-lg border">
      <MapContainer center={center} zoom={9} scrollWheelZoom={true} className="h-full w-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {driverLocations.map((loc) => (
          <Marker key={loc.id} position={[loc.latitud, loc.longitud]}>
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{loc.driver_name}</p>
                <p className="text-slate-500">
                  {new Date(loc.timestamp).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Argentina/Buenos_Aires",
                  })}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
