import Foundation
import CoreLocation

@Observable
@MainActor
class LocationService: NSObject, CLLocationManagerDelegate {
    static let shared = LocationService()

    var location: CLLocation?
    var cityName: String?
    var authorizationStatus: CLAuthorizationStatus = .notDetermined
    var isLoading = false

    private let manager = CLLocationManager()
    private let geocoder = CLGeocoder()
    private var continuations: [CheckedContinuation<CLLocation?, Never>] = []

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
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
        guard status == .authorizedWhenInUse || status == .authorizedAlways else {
            return nil
        }
        if let location {
            return location
        }
        return await withCheckedContinuation { cont in
            continuations.append(cont)
            manager.requestLocation()
        }
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

    private func resumeAllContinuations(with location: CLLocation?) {
        let pending = continuations
        continuations.removeAll()
        for cont in pending {
            cont.resume(returning: location)
        }
    }

    // MARK: - CLLocationManagerDelegate
    // NOTE: @MainActor na classe garante que o acesso a continuations e propriedades e thread-safe.
    // TODO: Adicionar timeout em getLocationOnce() para evitar continuations pendentes indefinidamente.

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in
            self.location = loc
            self.isLoading = false
            self.reverseGeocode(loc)
            self.resumeAllContinuations(with: loc)
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
                self.resumeAllContinuations(with: nil)
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.isLoading = false
            self.resumeAllContinuations(with: nil)
        }
    }
}
