import Foundation
import SwiftUI
import CoreLocation

@Observable
@MainActor
class HomeViewModel {
    var recentDiagnosis: DiagnosisResult?
    var diagnosisCount: Int = 0
    var weather: WeatherData?
    var isLoadingWeather = false
    var selectedCrop: CropType?
    var showCropSelector = false
    var showImagePicker = false
    var selectedImageData: Data?
    var tips: [QuickTip] = QuickTip.defaultTips

    private let locationService = LocationService.shared
    private let defaultLat = -15.78
    private let defaultLon = -47.93

    func loadWeather() async {
        isLoadingWeather = true
        locationService.requestPermissionAndLocation()

        try? await Task.sleep(for: .seconds(0.5))

        let lat: Double
        let lon: Double

        if let loc = locationService.location {
            lat = loc.coordinate.latitude
            lon = loc.coordinate.longitude
        } else if let loc = await locationService.getLocationOnce() {
            lat = loc.coordinate.latitude
            lon = loc.coordinate.longitude
        } else {
            lat = defaultLat
            lon = defaultLon
        }

        do {
            var weatherData = try await WeatherService.shared.fetchWeather(
                latitude: lat,
                longitude: lon
            )
            let locationName = locationService.cityName ?? "Sua região"
            weatherData = WeatherData(
                temperature: weatherData.temperature,
                apparentTemperature: weatherData.apparentTemperature,
                humidity: weatherData.humidity,
                precipitation: weatherData.precipitation,
                dailyPrecipitation: weatherData.dailyPrecipitation,
                windSpeed: weatherData.windSpeed,
                description: weatherData.description,
                icon: weatherData.icon,
                location: locationName
            )
            weather = weatherData
        } catch {
            weather = nil
        }
        isLoadingWeather = false
    }

    func loadRecentDiagnosis(token: String?, userId: String?) async {
        guard let token, let userId else { return }
        do {
            let results = try await SupabaseService.shared.fetchDiagnoses(token: token, userId: userId, limit: 1)
            recentDiagnosis = results.first
        } catch {
            recentDiagnosis = nil
        }
    }

    func loadDiagnosisCount(token: String?, userId: String?) async {
        guard let token, let userId else { return }
        do {
            diagnosisCount = try await SupabaseService.shared.fetchDiagnosisCount(token: token, userId: userId)
        } catch {
            diagnosisCount = 0
        }
    }

    var userLatitude: Double {
        locationService.location?.coordinate.latitude ?? defaultLat
    }

    var userLongitude: Double {
        locationService.location?.coordinate.longitude ?? defaultLon
    }
}

nonisolated struct QuickTip: Identifiable, Sendable {
    let id: UUID
    let icon: String
    let title: String
    let descriptionText: String

    static let defaultTips: [QuickTip] = [
        QuickTip(
            id: UUID(),
            icon: "camera.viewfinder",
            title: "Foto Nítida",
            descriptionText: "Tire fotos de perto, com boa iluminação, focando nos sintomas da planta."
        ),
        QuickTip(
            id: UUID(),
            icon: "leaf.arrow.triangle.circlepath",
            title: "MIP Primeiro",
            descriptionText: "Priorize controle biológico e cultural antes de tratamentos químicos."
        ),
        QuickTip(
            id: UUID(),
            icon: "clock.arrow.circlepath",
            title: "Monitore Sempre",
            descriptionText: "Amostragens semanais permitem detecção precoce e controle eficiente."
        ),
        QuickTip(
            id: UUID(),
            icon: "thermometer.sun",
            title: "Clima e Pragas",
            descriptionText: "Alta umidade e temperatura favorecem doenças fúngicas. Fique atento!"
        )
    ]
}
