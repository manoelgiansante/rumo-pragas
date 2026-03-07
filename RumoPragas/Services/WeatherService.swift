import Foundation

nonisolated final class WeatherService: Sendable {
    static let shared = WeatherService()

    func fetchWeather(latitude: Double, longitude: Double) async throws -> WeatherData {
        let urlString = "https://api.open-meteo.com/v1/forecast?latitude=\(latitude)&longitude=\(longitude)&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m&daily=precipitation_sum,rain_sum&timezone=auto&forecast_days=1"
        guard let url = URL(string: urlString) else { throw APIError.invalidURL }
        let (data, _) = try await URLSession.shared.data(from: url)
        let response = try JSONDecoder().decode(OpenMeteoResponse.self, from: data)

        let dailyPrecip = response.daily?.precipitationSum?.first ?? 0.0

        return WeatherData(
            temperature: response.current.temperature2m,
            apparentTemperature: response.current.apparentTemperature ?? response.current.temperature2m,
            humidity: response.current.relativeHumidity2m,
            precipitation: response.current.precipitation,
            dailyPrecipitation: dailyPrecip,
            windSpeed: response.current.windSpeed10m ?? 0,
            description: weatherDescription(code: response.current.weatherCode),
            icon: weatherIcon(code: response.current.weatherCode),
            location: ""
        )
    }

    private func weatherDescription(code: Int) -> String {
        switch code {
        case 0: "Céu limpo"
        case 1, 2, 3: "Parcialmente nublado"
        case 45, 48: "Nevoeiro"
        case 51, 53, 55: "Garoa"
        case 61, 63, 65: "Chuva"
        case 66, 67: "Chuva gelada"
        case 71, 73, 75: "Neve"
        case 80, 81, 82: "Pancadas de chuva"
        case 95, 96, 99: "Tempestade"
        default: "Variável"
        }
    }

    private func weatherIcon(code: Int) -> String {
        switch code {
        case 0: "sun.max.fill"
        case 1, 2, 3: "cloud.sun.fill"
        case 45, 48: "cloud.fog.fill"
        case 51, 53, 55: "cloud.drizzle.fill"
        case 61, 63, 65: "cloud.rain.fill"
        case 66, 67: "cloud.sleet.fill"
        case 71, 73, 75: "cloud.snow.fill"
        case 80, 81, 82: "cloud.heavyrain.fill"
        case 95, 96, 99: "cloud.bolt.rain.fill"
        default: "cloud.fill"
        }
    }
}

nonisolated struct OpenMeteoResponse: Codable, Sendable {
    let current: OpenMeteoCurrent
    let daily: OpenMeteoDaily?

    nonisolated struct OpenMeteoCurrent: Codable, Sendable {
        let temperature2m: Double
        let apparentTemperature: Double?
        let relativeHumidity2m: Double
        let precipitation: Double
        let weatherCode: Int
        let windSpeed10m: Double?

        nonisolated enum CodingKeys: String, CodingKey {
            case temperature2m = "temperature_2m"
            case apparentTemperature = "apparent_temperature"
            case relativeHumidity2m = "relative_humidity_2m"
            case precipitation
            case weatherCode = "weather_code"
            case windSpeed10m = "wind_speed_10m"
        }
    }

    nonisolated struct OpenMeteoDaily: Codable, Sendable {
        let precipitationSum: [Double]?
        let rainSum: [Double]?

        nonisolated enum CodingKeys: String, CodingKey {
            case precipitationSum = "precipitation_sum"
            case rainSum = "rain_sum"
        }
    }
}
