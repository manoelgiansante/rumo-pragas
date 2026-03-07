import Foundation

nonisolated struct WeatherData: Codable, Sendable {
    let temperature: Double
    let apparentTemperature: Double
    let humidity: Double
    let precipitation: Double
    let dailyPrecipitation: Double
    let windSpeed: Double
    let description: String
    let icon: String
    let location: String
}
