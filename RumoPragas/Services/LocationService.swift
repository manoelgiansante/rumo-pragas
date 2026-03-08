import Foundation
import CoreLocation

@Observable
class LocationService: NSObject, CLLocationManagerDelegate {
    static let shared = LocationService()

    var location: CLLocation?
    var cityName: String?
    var authorizationStatus: CLAuthorizationStatus = .notDetermined
    var isLoading = false

    private let manager = CLLocationManager()
    private let geocoder = CLGeocoder()
    private var continuation: CheckedContinuation<CLLocation?, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        authorizationStatus = manager.authorizationStatus
    }

    func requestPermissionAndLocation() {
        isLoading = true
        let status = manager.authorizationStatus
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else if status == .authorizedWhenInUse || status == .authorizedAlways {
            manager.requestLocation()
        } else {
            isLoading = false
        }
    }

    func getLocationOnce() async -> CLLocation? {
        let status = manager.authorizationStatus
        if status == .authorizedWhenInUse || status == .authorizedAlways {
            if let location {
                return location
            }
            return await withCheckedContinuation { cont in
                if let existing = self.continuation {
                    existing.resume(returning: self.location)
                }
                self.continuation = cont
                manager.requestLocation()
            }
        }
        return nil
    }

    private func reverseGeocode(_ location: CLLocation) {
        Task {
            do {
                let placemarks = try await geocoder.reverseGeocodeLocation(location)
                if let placemark = placemarks.first {
                    let city = placemark.locality
                    let state = placemark.administrativeArea
                    if let city, let state {
                        self.cityName = "\(city), \(state)"
                    } else {
                        self.cityName = city ?? state ?? "Brasil"
                    }
                }
            } catch {
                self.cityName = nil
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in
            self.location = loc
            self.isLoading = false
            self.reverseGeocode(loc)
            self.continuation?.resume(returning: loc)
            self.continuation = nil
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorizationStatus = status
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                manager.requestLocation()
            } else if status == .denied || status == .restricted {
                self.isLoading = false
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.isLoading = false
            self.continuation?.resume(returning: nil)
            self.continuation = nil
        }
    }
}
