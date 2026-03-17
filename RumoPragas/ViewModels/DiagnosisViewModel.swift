import Foundation
import SwiftUI
import CoreLocation
import UIKit

@Observable
@MainActor
class DiagnosisViewModel {
    var isAnalyzing = false
    var progress: Double = 0
    var statusMessage = ""
    var result: DiagnosisResult?
    var errorMessage: String?
    var selectedCrop: CropType = .soja
    var imageData: Data?

    private static nonisolated func compressImage(_ data: Data, maxSizeKB: Int = 800) -> Data {
        guard let uiImage = UIImage(data: data) else { return data }
        let maxDimension: CGFloat = 1280
        let size = uiImage.size
        var scale: CGFloat = 1.0
        if max(size.width, size.height) > maxDimension {
            scale = maxDimension / max(size.width, size.height)
        }
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in
            uiImage.draw(in: CGRect(origin: .zero, size: newSize))
        }
        var compression: CGFloat = 0.7
        var compressed = resized.jpegData(compressionQuality: compression)
        while let c = compressed, c.count > maxSizeKB * 1024, compression > 0.1 {
            compression -= 0.1
            compressed = resized.jpegData(compressionQuality: compression)
        }
        return compressed ?? data
    }

    func startDiagnosis(token: String?) async {
        guard let imageData else {
            errorMessage = "Selecione uma imagem para análise"
            return
        }
        isAnalyzing = true
        defer { isAnalyzing = false }
        errorMessage = nil
        progress = 0

        statusMessage = "Preparando imagem..."
        progress = 0.1

        guard let token else {
            errorMessage = "Faça login para usar o diagnóstico"
            return
        }

        do {
            let capturedData = imageData
            let compressed = await Task.detached {
                DiagnosisViewModel.compressImage(capturedData)
            }.value
            let base64Image = compressed.base64EncodedString()

            statusMessage = "Enviando para análise..."
            progress = 0.2

            let loc = LocationService.shared.location
            let lat = loc?.coordinate.latitude ?? -15.78
            let lon = loc?.coordinate.longitude ?? -47.93

            let payload: [String: Any] = [
                "crop_type": selectedCrop.apiName,
                "image_base64": base64Image,
                "latitude": lat,
                "longitude": lon
            ]
            let body = try JSONSerialization.data(withJSONObject: payload)

            statusMessage = "Identificando praga..."
            progress = 0.5

            let data = try await SupabaseService.shared.callEdgeFunction(
                name: "diagnose",
                body: body,
                token: token
            )

            statusMessage = "Processando resultado..."
            progress = 0.85

            do {
                let decoder = JSONDecoder()
                result = try decoder.decode(DiagnosisResult.self, from: data)
            } catch {
                if let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    if let errMsg = dict["error"] as? String {
                        throw APIError.serverError(errMsg)
                    }
                    if let msg = dict["message"] as? String {
                        throw APIError.serverError(msg)
                    }

                    result = try parseFlatResponse(dict)
                } else if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]], let first = arr.first {
                    result = try parseFlatResponse(first)
                } else {
                    throw APIError.serverError("Resposta inesperada do servidor. Tente novamente.")
                }
            }

            progress = 1.0
            statusMessage = "Diagnóstico completo!"
            try? await Task.sleep(for: .seconds(0.5))
        } catch let error as APIError {
            handleAPIError(error)
        } catch {
            errorMessage = "Erro: \(error.localizedDescription)"
        }
    }

    private func parseFlatResponse(_ dict: [String: Any]) throws -> DiagnosisResult {
        let id = dict["id"] as? String ?? UUID().uuidString
        let userId = dict["user_id"] as? String ?? ""
        let crop = dict["crop"] as? String ?? dict["crop_type"] as? String ?? selectedCrop.apiName
        let pestId = dict["pest_id"] as? String ?? dict["pestId"] as? String
        let pestName = dict["pest_name"] as? String ?? dict["pestName"] as? String ?? dict["name"] as? String
        let confidence = dict["confidence"] as? Double
        let imageUrl = dict["image_url"] as? String ?? dict["imageUrl"] as? String
        let locationLat = dict["location_lat"] as? Double ?? dict["latitude"] as? Double
        let locationLng = dict["location_lng"] as? Double ?? dict["longitude"] as? Double
        let locationName = dict["location_name"] as? String ?? dict["locationName"] as? String
        let createdAt = dict["created_at"] as? String ?? dict["createdAt"] as? String ?? ISO8601DateFormatter().string(from: Date())

        var notes: String?
        if let notesStr = dict["notes"] as? String {
            notes = notesStr
        } else if let notesDict = dict["notes"] as? [String: Any] {
            if let notesData = try? JSONSerialization.data(withJSONObject: notesDict) {
                notes = String(data: notesData, encoding: .utf8)
            }
        } else {
            var enrichmentDict: [String: Any] = [:]
            for key in ["enrichment", "predictions", "id_array", "idArray", "message", "crop_confidence", "cropConfidence"] {
                if let val = dict[key] {
                    enrichmentDict[key] = val
                }
            }
            if !enrichmentDict.isEmpty {
                if let notesData = try? JSONSerialization.data(withJSONObject: enrichmentDict) {
                    notes = String(data: notesData, encoding: .utf8)
                }
            }
        }

        return DiagnosisResult(
            id: id,
            userId: userId,
            crop: crop,
            pestId: pestId,
            pestName: pestName,
            confidence: confidence,
            imageUrl: imageUrl,
            notes: notes,
            locationLat: locationLat,
            locationLng: locationLng,
            locationName: locationName,
            createdAt: createdAt
        )
    }

    private func handleAPIError(_ error: APIError) {
        switch error {
        case .serverError(let msg):
            if msg.lowercased().contains("assinatura") || msg.lowercased().contains("subscription") {
                errorMessage = "Assinatura necessária para diagnóstico por IA. Atualize seu plano nas configurações."
            } else if msg.lowercased().contains("token") || msg.lowercased().contains("auth") {
                errorMessage = "Sessão expirada. Faça login novamente."
            } else {
                errorMessage = msg
            }
        default:
            errorMessage = error.errorDescription ?? "Erro desconhecido"
        }
    }

    func reset() {
        isAnalyzing = false
        progress = 0
        statusMessage = ""
        result = nil
        errorMessage = nil
        imageData = nil
    }
}
