import Foundation
import SwiftUI
import CoreLocation

@Observable
@MainActor
class HomeViewModel {
    var recentDiagnosis: DiagnosisResult?
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

        try? await Task.sleep(for: .seconds(2))

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

    var userLatitude: Double {
        locationService.location?.coordinate.latitude ?? defaultLat
    }

    var userLongitude: Double {
        locationService.location?.coordinate.longitude ?? defaultLon
    }
}

nonisolated struct QuickTip: Identifiable, Sendable {
    let id = UUID()
    let icon: String
    let title: String
    let description: String
    let color: Color

    static let defaultTips: [QuickTip] = [
        QuickTip(
            icon: "camera.viewfinder",
            title: "Foto Nítida",
            description: "Tire fotos de perto, com boa iluminação, focando nos sintomas da planta.",
            color: .blue
        ),
        QuickTip(
            icon: "leaf.arrow.triangle.circlepath",
            title: "MIP Primeiro",
            description: "Priorize controle biológico e cultural antes de tratamentos químicos.",
            color: Color(red: 0.18, green: 0.55, blue: 0.24)
        ),
        QuickTip(
            icon: "clock.arrow.circlepath",
            title: "Monitore Sempre",
            description: "Amostragens semanais permitem detecção precoce e controle eficiente.",
            color: .orange
        ),
        QuickTip(
            icon: "thermometer.sun",
            title: "Clima e Pragas",
            description: "Alta umidade e temperatura favorecem doenças fúngicas. Fique atento!",
            color: .red
        )
    ]
}
